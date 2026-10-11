/**
 * lib/config/models.ts — AI model configuration constants
 *
 * All model identifiers, rate limits, and unit prices are defined here.
 * No model name or pricing is ever hard-coded in business logic.
 *
 * Exigences : 3.1
 */

export interface ModelConfig {
  /** Full model identifier sent to the API */
  modelId: string;
  /** Requests per minute limit */
  rpmLimit: number;
  /** Requests per day limit */
  rpdLimit: number;
  /** Estimated cost per call in RODI (used when the API does not report cost) */
  unitPriceRodi: number;
}

export interface LLMModelConfig extends ModelConfig {
  /** Maximum context window in tokens */
  maxContextTokens: number;
  /** Estimated cost per 1k input tokens in RODI */
  inputPricePer1kRodi: number;
  /** Estimated cost per 1k output tokens in RODI */
  outputPricePer1kRodi: number;
}

// ─── Image generation models ────────────────────────────────────────────────

export const IMAGE_MODELS = {
  default: {
    modelId: 'rodiumai-image-v1',
    rpmLimit: 10,
    rpdLimit: 200,
    unitPriceRodi: 5,
  } satisfies ModelConfig,
} as const;

// ─── LLM (chat + vision) models ─────────────────────────────────────────────

export const LLM_MODELS = {
  /** Default model used for chat completions */
  chat: {
    modelId: 'rodiumai-llm-v1',
    rpmLimit: 30,
    rpdLimit: 500,
    unitPriceRodi: 1,
    maxContextTokens: 128_000,
    inputPricePer1kRodi: 0.5,
    outputPricePer1kRodi: 1.5,
  } satisfies LLMModelConfig,

  /** Default model used for vision tasks */
  vision: {
    modelId: 'rodiumai-vision-v1',
    rpmLimit: 15,
    rpdLimit: 300,
    unitPriceRodi: 2,
    maxContextTokens: 32_000,
    inputPricePer1kRodi: 1.0,
    outputPricePer1kRodi: 2.0,
  } satisfies LLMModelConfig,
} as const;

// ─── API endpoints ───────────────────────────────────────────────────────────

export const RODIUMAI_ENDPOINTS = {
  /** OpenAI-compatible chat completions */
  chatCompletions: '/v1/chat/completions',
  /** Image generation */
  imageGenerations: '/v1/images/generations',
} as const;
