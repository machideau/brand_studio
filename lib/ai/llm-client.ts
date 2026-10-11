/**
 * lib/ai/llm-client.ts — RodiumAI LLM client (chat + vision)
 *
 * Provides two functions:
 *  - chat()   — calls the OpenAI-compatible chat completions endpoint
 *  - vision() — calls the same endpoint with an image_url message part
 *
 * Retry policy (matches ImageProvider):
 *  - On HTTP 429: respect Retry-After header (or 1 s fallback), then retry
 *  - On HTTP 5xx: exponential backoff starting at 1 s, doubling each attempt,
 *    plus random jitter of 0–500 ms
 *  - After maxRetries failures: throw StructuredLLMError
 *
 * Security rules:
 *  - NEVER log LLM response content in plain text
 *  - API key is never logged
 *
 * Exigences : 3.3, 25.3
 */

import env from '@/lib/config/env';
import { LLM_MODELS, RODIUMAI_ENDPOINTS } from '@/lib/config/models';
import { recordCost } from '@/lib/db/queries/costs';
import { log } from '@/lib/logger';

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  projectId?: string;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  declaredCost?: number;
  estimatedCost: number;
  attempts: number;
}

export interface VisionOptions {
  model?: string;
  projectId?: string;
}

export interface VisionResult {
  content: string;
  model: string;
  declaredCost?: number;
  estimatedCost: number;
  attempts: number;
}

// ─── Internal error type ─────────────────────────────────────────────────────

export class StructuredLLMError extends Error {
  constructor(
    public readonly llmModel: string,
    public readonly operation: 'chat' | 'vision',
    public readonly attempts: number,
    message: string,
  ) {
    super(message);
    this.name = 'StructuredLLMError';
  }
}

// ─── OpenAI-compatible API payload shapes ────────────────────────────────────

interface OpenAITextPart {
  type: 'text';
  text: string;
}

interface OpenAIImageUrlPart {
  type: 'image_url';
  image_url: {
    url: string; // data URL: "data:<mime>;base64,<data>"
  };
}

type OpenAIMessageContent = string | Array<OpenAITextPart | OpenAIImageUrlPart>;

interface OpenAIRequestMessage {
  role: 'user' | 'assistant' | 'system';
  content: OpenAIMessageContent;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIRequestMessage[];
  temperature?: number;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChoice {
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

interface OpenAIResponse {
  id: string;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
  /** RodiumAI may include cost in credits */
  cost?: number;
}

// ─── Retry / backoff helpers ─────────────────────────────────────────────────

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const JITTER_MAX_MS = 500;

/**
 * Parse the Retry-After header value (seconds integer or HTTP date).
 * Returns a millisecond delay, defaulting to `fallbackMs` when unparseable.
 */
function parseRetryAfterMs(headerValue: string | null, fallbackMs: number): number {
  if (headerValue === null) return fallbackMs;

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = new Date(headerValue);
  if (!isNaN(date.getTime())) {
    const delta = date.getTime() - Date.now();
    return Math.max(0, delta);
  }

  return fallbackMs;
}

/**
 * Exponential backoff with jitter for non-429 retryable errors.
 * delay = min(initial * 2^attempt, max) + random(0, jitterMax)
 */
function backoffDelayMs(attempt: number): number {
  const base = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = Math.random() * JITTER_MAX_MS;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true for status codes that should be retried */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

// ─── Core HTTP call ──────────────────────────────────────────────────────────

/**
 * Send a single request to the chat completions endpoint.
 * Returns the parsed OpenAIResponse on success; throws on non-retryable errors.
 * Throws a special object `{ retryAfterMs }` on retryable errors so callers
 * can schedule the next attempt.
 */
async function postChatCompletions(
  payload: OpenAIRequest,
  operation: 'chat' | 'vision',
): Promise<OpenAIResponse> {
  const url = env.RODIUMAI_BASE_URL + RODIUMAI_ENDPOINTS.chatCompletions;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RODIUMAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    // Network-level failure — treat as a 503 for retry purposes
    throw { retryAfterMs: null, networkError: networkErr };
  }

  if (response.ok) {
    const json = (await response.json()) as OpenAIResponse;
    return json;
  }

  if (isRetryable(response.status)) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterMs =
      response.status === 429
        ? parseRetryAfterMs(retryAfterHeader, INITIAL_DELAY_MS)
        : null; // backoff will be computed by caller for 5xx
    throw { retryAfterMs, httpStatus: response.status };
  }

  // Non-retryable HTTP error
  throw new Error(
    `[llm-client] ${operation} failed with HTTP ${response.status} (non-retryable)`,
  );
}

// ─── Retry loop ──────────────────────────────────────────────────────────────

interface RetryResult {
  response: OpenAIResponse;
  attempts: number;
}

async function withRetry(
  payload: OpenAIRequest,
  operation: 'chat' | 'vision',
  modelId: string,
): Promise<RetryResult> {
  const maxRetries = env.MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await postChatCompletions(payload, operation);
      return { response, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;

      const isRetrySignal =
        err !== null &&
        typeof err === 'object' &&
        ('retryAfterMs' in (err as object) || 'networkError' in (err as object));

      if (!isRetrySignal) {
        // Non-retryable — re-throw immediately
        throw err;
      }

      if (attempt >= maxRetries) {
        break;
      }

      const signal = err as { retryAfterMs: number | null; httpStatus?: number };

      let delayMs: number;
      if (signal.retryAfterMs !== null && signal.retryAfterMs !== undefined) {
        delayMs = signal.retryAfterMs;
      } else {
        delayMs = backoffDelayMs(attempt);
      }

      log.warn(`[llm-client] ${operation} retryable error, waiting before retry`, {
        step: `llm_${operation}`,
        error: {
          code: signal.httpStatus ? `HTTP_${signal.httpStatus}` : 'NETWORK_ERROR',
          model: modelId,
          operation,
          attempts: attempt + 1,
        },
      });

      await sleep(delayMs);
    }
  }

  // All retries exhausted
  throw new StructuredLLMError(
    modelId,
    operation,
    maxRetries + 1,
    `[llm-client] ${operation} failed after ${maxRetries + 1} attempts`,
  );
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

/**
 * Estimate cost in RODI when the API does not return an explicit cost.
 * Uses per-token pricing when usage data is available; falls back to unit price.
 */
function estimateCost(
  response: OpenAIResponse,
  unitPriceRodi: number,
  inputPricePer1kRodi: number,
  outputPricePer1kRodi: number,
): number {
  if (response.usage) {
    const inputCost = (response.usage.prompt_tokens / 1_000) * inputPricePer1kRodi;
    const outputCost = (response.usage.completion_tokens / 1_000) * outputPricePer1kRodi;
    return inputCost + outputCost;
  }
  return unitPriceRodi;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a chat completion request to RodiumAI.
 *
 * - Retries on 429/5xx with exponential backoff + jitter
 * - Never logs response content
 * - Records cost via recordCost()
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const modelConfig = LLM_MODELS.chat;
  const modelId = options.model ?? modelConfig.modelId;
  const operation = 'chat' as const;

  const payload: OpenAIRequest = {
    model: modelId,
    messages,
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  };

  log.info('[llm-client] Starting chat request', {
    step: 'llm_chat',
    projectId: options.projectId,
    error: undefined,
  });

  const { response, attempts } = await withRetry(payload, operation, modelId);

  const declaredCost: number | undefined =
    typeof response.cost === 'number' ? response.cost : undefined;

  const estimatedCost = estimateCost(
    response,
    modelConfig.unitPriceRodi,
    modelConfig.inputPricePer1kRodi,
    modelConfig.outputPricePer1kRodi,
  );

  const resolvedModel = response.model ?? modelId;

  // Record cost (non-blocking; log error but don't fail the call)
  if (options.projectId) {
    recordCost({
      project_id: options.projectId,
      provider: 'rodiumai',
      model: resolvedModel,
      operation,
      declared_cost: declaredCost ?? null,
      estimated_cost: estimatedCost,
      attempts,
    }).catch((err: unknown) => {
      log.error('[llm-client] Failed to record chat cost', {
        step: 'llm_chat',
        projectId: options.projectId,
        error: err,
      });
    });
  }

  log.info('[llm-client] Chat request completed', {
    step: 'llm_chat',
    projectId: options.projectId,
    error: undefined,
  });

  const content = response.choices[0]?.message?.content ?? '';

  return {
    content,
    model: resolvedModel,
    ...(declaredCost !== undefined && { declaredCost }),
    estimatedCost,
    attempts,
  };
}

/**
 * Send a vision request to RodiumAI by embedding a base64 image in the chat
 * completions payload (OpenAI-compatible image_url message part).
 *
 * - Retries on 429/5xx with exponential backoff + jitter
 * - Never logs response content or image data
 * - Records cost via recordCost()
 */
export async function vision(
  imageBase64: string,
  prompt: string,
  options: VisionOptions = {},
): Promise<VisionResult> {
  const modelConfig = LLM_MODELS.vision;
  const modelId = options.model ?? modelConfig.modelId;
  const operation = 'vision' as const;

  // Build an OpenAI-compatible multimodal message
  const messages: OpenAIRequestMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            // The base64 string is expected to be a raw base64 payload;
            // we embed it as a PNG data URL. The caller is responsible for
            // providing the correct MIME type prefix when needed.
            url: imageBase64.startsWith('data:')
              ? imageBase64
              : `data:image/png;base64,${imageBase64}`,
          },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    },
  ];

  const payload: OpenAIRequest = {
    model: modelId,
    messages,
  };

  log.info('[llm-client] Starting vision request', {
    step: 'llm_vision',
    projectId: options.projectId,
  });

  const { response, attempts } = await withRetry(payload, operation, modelId);

  const declaredCost: number | undefined =
    typeof response.cost === 'number' ? response.cost : undefined;

  const estimatedCost = estimateCost(
    response,
    modelConfig.unitPriceRodi,
    modelConfig.inputPricePer1kRodi,
    modelConfig.outputPricePer1kRodi,
  );

  const resolvedModel = response.model ?? modelId;

  if (options.projectId) {
    recordCost({
      project_id: options.projectId,
      provider: 'rodiumai',
      model: resolvedModel,
      operation,
      declared_cost: declaredCost ?? null,
      estimated_cost: estimatedCost,
      attempts,
    }).catch((err: unknown) => {
      log.error('[llm-client] Failed to record vision cost', {
        step: 'llm_vision',
        projectId: options.projectId,
        error: err,
      });
    });
  }

  log.info('[llm-client] Vision request completed', {
    step: 'llm_vision',
    projectId: options.projectId,
  });

  const content = response.choices[0]?.message?.content ?? '';

  return {
    content,
    model: resolvedModel,
    ...(declaredCost !== undefined && { declaredCost }),
    estimatedCost,
    attempts,
  };
}
