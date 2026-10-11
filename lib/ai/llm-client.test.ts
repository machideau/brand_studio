/**
 * lib/ai/llm-client.test.ts — Unit tests for LLM client (chat + vision)
 *
 * Tests cover:
 *  - Successful chat and vision calls
 *  - Retry on 429 (with Retry-After header)
 *  - Retry on 5xx with exponential backoff
 *  - StructuredLLMError thrown after maxRetries exhausted
 *  - Cost recording (with and without projectId)
 *  - Base64 image handling in vision (with/without data: prefix)
 *  - Non-retryable errors propagate immediately
 *
 * Exigences : 3.3, 25.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chat, vision, StructuredLLMError } from './llm-client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/config/env', () => ({
  default: {
    RODIUMAI_API_KEY: 'test-api-key',
    RODIUMAI_BASE_URL: 'https://api.rodiumai.test',
    MAX_RETRIES: 2,
  },
}));

vi.mock('@/lib/db/queries/costs', () => ({
  recordCost: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOpenAIResponse(overrides: Partial<{
  id: string;
  model: string;
  content: string;
  cost: number;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> = {}) {
  return {
    id: overrides.id ?? 'resp-1',
    model: overrides.model ?? 'rodiumai-llm-v1',
    choices: [
      {
        message: { role: 'assistant', content: overrides.content ?? 'Hello from AI' },
        finish_reason: 'stop',
      },
    ],
    ...(overrides.usage !== undefined && { usage: overrides.usage }),
    ...(overrides.cost !== undefined && { cost: overrides.cost }),
  };
}

function mockFetchSuccess(body: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  });
}

function mockFetchStatus(status: number, retryAfterHeader: string | null = null) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: { get: (name: string) => (name === 'Retry-After' ? retryAfterHeader : null) },
    json: () => Promise.resolve({ error: `HTTP ${status}` }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('chat()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns content, model, estimatedCost and attempts=1 on first-try success', async () => {
    const responseBody = makeOpenAIResponse({ content: 'Bonjour!', model: 'rodiumai-llm-v1' });
    global.fetch = mockFetchSuccess(responseBody);

    const result = await chat([{ role: 'user', content: 'Hello' }]);

    expect(result.content).toBe('Bonjour!');
    expect(result.model).toBe('rodiumai-llm-v1');
    expect(result.attempts).toBe(1);
    expect(typeof result.estimatedCost).toBe('number');
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it('sends the correct Authorization header and Content-Type', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await chat([{ role: 'user', content: 'test' }]);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.rodiumai.test/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-api-key');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('passes temperature from options when provided', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await chat([{ role: 'user', content: 'test' }], { temperature: 0.5 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.temperature).toBe(0.5);
  });

  it('does not include temperature in payload when not provided', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await chat([{ role: 'user', content: 'test' }]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.temperature).toBeUndefined();
  });

  it('uses declared cost from response when the API reports it', async () => {
    const responseBody = makeOpenAIResponse({ cost: 42 });
    global.fetch = mockFetchSuccess(responseBody);

    const result = await chat([{ role: 'user', content: 'test' }]);

    expect(result.declaredCost).toBe(42);
  });

  it('does not set declaredCost when the API does not report one', async () => {
    const responseBody = makeOpenAIResponse();
    global.fetch = mockFetchSuccess(responseBody);

    const result = await chat([{ role: 'user', content: 'test' }]);

    expect(result.declaredCost).toBeUndefined();
  });

  it('estimates cost from token usage when usage is present', async () => {
    const responseBody = makeOpenAIResponse({
      usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
    });
    global.fetch = mockFetchSuccess(responseBody);

    const result = await chat([{ role: 'user', content: 'test' }]);

    // inputPricePer1kRodi=0.5 → 0.5 RODI for 1k input tokens
    // outputPricePer1kRodi=1.5 → 1.5 RODI for 1k output tokens
    expect(result.estimatedCost).toBeCloseTo(0.5 + 1.5, 5);
  });

  it('falls back to unit price when no usage is present', async () => {
    const responseBody = makeOpenAIResponse(); // no usage field
    global.fetch = mockFetchSuccess(responseBody);

    const result = await chat([{ role: 'user', content: 'test' }]);

    // unitPriceRodi for chat = 1
    expect(result.estimatedCost).toBe(1);
  });

  it('calls recordCost when projectId is provided', async () => {
    const { recordCost } = await import('@/lib/db/queries/costs');
    const responseBody = makeOpenAIResponse();
    global.fetch = mockFetchSuccess(responseBody);

    await chat([{ role: 'user', content: 'test' }], { projectId: 'proj-123' });

    // Allow the non-blocking promise to settle
    await vi.runAllTimersAsync();
    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'proj-123', operation: 'chat' }),
    );
  });

  it('does not call recordCost when projectId is absent', async () => {
    const { recordCost } = await import('@/lib/db/queries/costs');
    vi.mocked(recordCost).mockClear();
    const responseBody = makeOpenAIResponse();
    global.fetch = mockFetchSuccess(responseBody);

    await chat([{ role: 'user', content: 'test' }]);

    await vi.runAllTimersAsync();
    expect(recordCost).not.toHaveBeenCalled();
  });

  it('retries on HTTP 429 and succeeds on second attempt', async () => {
    const successBody = makeOpenAIResponse({ content: 'Retry worked' });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '0' : null) },
        json: () => Promise.resolve({ error: 'rate limited' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(successBody),
      });

    const resultPromise = chat([{ role: 'user', content: 'test' }]);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.content).toBe('Retry worked');
    expect(result.attempts).toBe(2);
  });

  it('retries on HTTP 503 and succeeds on second attempt', async () => {
    const successBody = makeOpenAIResponse({ content: '503 retry ok' });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: () => Promise.resolve({ error: 'service unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(successBody),
      });

    const resultPromise = chat([{ role: 'user', content: 'test' }]);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.content).toBe('503 retry ok');
    expect(result.attempts).toBe(2);
  });

  it('throws StructuredLLMError after all retries are exhausted', async () => {
    global.fetch = mockFetchStatus(500);

    // Attach handler before advancing timers to avoid unhandled rejection
    const resultPromise = chat([{ role: 'user', content: 'test' }]).catch((e: unknown) => e);
    // MAX_RETRIES=2 → 3 total attempts; advance timers for backoff delays
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    const result = await resultPromise;
    expect(result).toBeInstanceOf(StructuredLLMError);
  });

  it('StructuredLLMError carries model, operation and attempts', async () => {
    global.fetch = mockFetchStatus(500);

    // Attach handler before advancing timers to avoid unhandled rejection
    const resultPromise = chat([{ role: 'user', content: 'test' }]).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    const err = await resultPromise;
    expect(err).toBeInstanceOf(StructuredLLMError);
    const structured = err as StructuredLLMError;
    expect(structured.operation).toBe('chat');
    expect(structured.attempts).toBe(3); // MAX_RETRIES=2 → 3 total attempts
    expect(typeof structured.llmModel).toBe('string');
  });

  it('propagates non-retryable HTTP error immediately without retrying', async () => {
    global.fetch = mockFetchStatus(400); // 400 Bad Request — non-retryable

    await expect(chat([{ role: 'user', content: 'test' }])).rejects.toThrow('non-retryable');
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('uses a custom model when provided in options', async () => {
    const responseBody = makeOpenAIResponse({ model: 'custom-model-v2' });
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await chat([{ role: 'user', content: 'test' }], { model: 'custom-model-v2' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('custom-model-v2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('vision()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns content, model, estimatedCost and attempts=1 on success', async () => {
    const responseBody = makeOpenAIResponse({ content: 'I see a logo', model: 'rodiumai-vision-v1' });
    global.fetch = mockFetchSuccess(responseBody);

    const result = await vision('base64data', 'Describe this image');

    expect(result.content).toBe('I see a logo');
    expect(result.model).toBe('rodiumai-vision-v1');
    expect(result.attempts).toBe(1);
    expect(typeof result.estimatedCost).toBe('number');
  });

  it('wraps raw base64 in a data: URL when no prefix is present', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await vision('rawbase64string==', 'What is this?');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const imageUrlPart = body.messages[0].content.find(
      (p: { type: string }) => p.type === 'image_url',
    );
    expect(imageUrlPart.image_url.url).toBe('data:image/png;base64,rawbase64string==');
  });

  it('passes through an existing data: URL unchanged', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ==';
    await vision(dataUrl, 'What is this?');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const imageUrlPart = body.messages[0].content.find(
      (p: { type: string }) => p.type === 'image_url',
    );
    expect(imageUrlPart.image_url.url).toBe(dataUrl);
  });

  it('includes the prompt as a text content part', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await vision('base64data', 'Analyse ce logo');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const textPart = body.messages[0].content.find((p: { type: string }) => p.type === 'text');
    expect(textPart.text).toBe('Analyse ce logo');
  });

  it('uses the vision model by default', async () => {
    const responseBody = makeOpenAIResponse();
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await vision('base64', 'test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('rodiumai-vision-v1');
  });

  it('uses a custom model when provided in options', async () => {
    const responseBody = makeOpenAIResponse({ model: 'rodiumai-vision-v2' });
    const mockFetch = mockFetchSuccess(responseBody);
    global.fetch = mockFetch;

    await vision('base64', 'test', { model: 'rodiumai-vision-v2' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('rodiumai-vision-v2');
  });

  it('falls back to unit price when no token usage is present', async () => {
    const responseBody = makeOpenAIResponse(); // no usage
    global.fetch = mockFetchSuccess(responseBody);

    const result = await vision('base64', 'test');

    // unitPriceRodi for vision = 2
    expect(result.estimatedCost).toBe(2);
  });

  it('estimates cost from token usage when available', async () => {
    const responseBody = makeOpenAIResponse({
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    });
    global.fetch = mockFetchSuccess(responseBody);

    const result = await vision('base64', 'test');

    // inputPricePer1kRodi=1.0 → 1.0 RODI; outputPricePer1kRodi=2.0 → 1.0 RODI
    expect(result.estimatedCost).toBeCloseTo(1.0 + 1.0, 5);
  });

  it('throws StructuredLLMError after all retries are exhausted', async () => {
    global.fetch = mockFetchStatus(503);

    // Attach handler before advancing timers to avoid unhandled rejection
    const resultPromise = vision('base64', 'test').catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    const err = await resultPromise;
    expect(err).toBeInstanceOf(StructuredLLMError);
    const structured = err as StructuredLLMError;
    expect(structured.operation).toBe('vision');
  });

  it('calls recordCost when projectId is provided', async () => {
    const { recordCost } = await import('@/lib/db/queries/costs');
    vi.mocked(recordCost).mockClear();
    const responseBody = makeOpenAIResponse();
    global.fetch = mockFetchSuccess(responseBody);

    await vision('base64', 'test', { projectId: 'proj-vision-456' });

    await vi.runAllTimersAsync();
    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'proj-vision-456', operation: 'vision' }),
    );
  });
});
