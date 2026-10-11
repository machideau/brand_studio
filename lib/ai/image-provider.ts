/**
 * lib/ai/image-provider.ts — RodiumAI image generation abstraction
 *
 * Provides:
 *  - Public interfaces: ImageGenerationRequest, ImageGenerationResult,
 *    ImageProvider, ImageProviderConfig
 *  - StructuredImageError: structured error thrown after max retries
 *  - RodiumAIImageProvider: concrete implementation
 *  - createRodiumAIImageProvider: factory function
 *
 * Behaviour:
 *  - Idempotence: returns cached result if asset already exists with status='done'
 *  - Domain allowlist: validates every reference-image URL against allowedDomains
 *  - Body size cap: resizes reference images with sharp when the request body
 *    would exceed maxRequestBodyMib MiB
 *  - Rate limiting: on 429, waits Retry-After header (or exponential backoff
 *    with jitter) and retries up to maxRetries times
 *  - Cost tracking: calls recordCost() on every successful generation
 *
 * Exigences : 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import sharp from 'sharp';

import env from '@/lib/config/env';
import { IMAGE_MODELS, RODIUMAI_ENDPOINTS } from '@/lib/config/models';
import { getAsset } from '@/lib/db/queries/assets';
import { recordCost } from '@/lib/db/queries/costs';
import { log } from '@/lib/logger';

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  model: string;
  /** Base64 data URLs (e.g. data:image/png;base64,…), max 14 entries */
  referenceImages?: string[];
  /** Idempotency key: projectId_supportType_charterVersion (or similar) */
  idempotencyKey: string;
}

export interface ImageGenerationResult {
  imageBase64: string;
  model: string;
  declaredCost?: number;   // in RODI, if reported by the API
  estimatedCost: number;   // always present
  attempts: number;
  fromCache: boolean;
}

export interface ImageProvider {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface ImageProviderConfig {
  model: string;
  endpoint: string;
  allowedDomains: string[];
  maxRequestBodyMib: number;
  maxRetries: number;
  unitPriceRodi: number;
  rpmLimit: number;
  rpdLimit: number;
}

// ─── Structured error ────────────────────────────────────────────────────────

export class StructuredImageError extends Error {
  constructor(
    public readonly model: string,
    public readonly operation: string,
    public readonly attempts: number,
    message: string,
  ) {
    super(message);
    this.name = 'StructuredImageError';
  }
}

// ─── Default configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG: ImageProviderConfig = {
  model: IMAGE_MODELS.default.modelId,
  endpoint: RODIUMAI_ENDPOINTS.imageGenerations,
  allowedDomains: [],
  maxRequestBodyMib: 10,
  maxRetries: IMAGE_MODELS.default.rpmLimit,   // sane default; callers override
  unitPriceRodi: IMAGE_MODELS.default.unitPriceRodi,
  rpmLimit: IMAGE_MODELS.default.rpmLimit,
  rpdLimit: IMAGE_MODELS.default.rpdLimit,
};

// ─── Backoff / retry helpers ──────────────────────────────────────────────────

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const JITTER_MAX_MS = 500;

/**
 * Parse the Retry-After header (integer seconds or HTTP date).
 * Falls back to `fallbackMs` when unparseable.
 */
function parseRetryAfterMs(headerValue: string | null, fallbackMs: number): number {
  if (headerValue === null) return fallbackMs;

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = new Date(headerValue);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return fallbackMs;
}

/**
 * Exponential backoff with jitter for non-429 retryable failures.
 * delay = min(2^attempt * 1000 + random(0, JITTER_MAX_MS), MAX_DELAY_MS)
 */
function backoffDelayMs(attempt: number): number {
  const base = Math.min(Math.pow(2, attempt) * INITIAL_DELAY_MS, MAX_DELAY_MS);
  const jitter = Math.random() * JITTER_MAX_MS;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Body-size helpers ────────────────────────────────────────────────────────

const MIB = 1_048_576; // bytes per MiB

/**
 * Extract the raw binary content of a base64 data URL.
 * Accepts either "data:<mime>;base64,<data>" or a bare base64 string.
 */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Buffer.from(b64, 'base64');
}

/**
 * Convert a Buffer back to a data URL with the given MIME type.
 */
function bufferToDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Estimate the JSON body size in bytes for the given payload object.
 * Returns the byte length of JSON.stringify(payload).
 */
function estimateBodyBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

/**
 * Resize a single reference image (data URL) to approximately `targetBytes`
 * while keeping its aspect ratio, using sharp.
 *
 * Strategy: reduce each dimension by the square root of the ratio
 * (targetBytes / currentBytes) so that width * height shrinks proportionally.
 */
async function resizeReferenceImage(
  dataUrl: string,
  targetBytes: number,
): Promise<string> {
  const originalBuf = dataUrlToBuffer(dataUrl);
  const currentBytes = originalBuf.byteLength;

  if (currentBytes <= targetBytes) return dataUrl;

  // Determine current dimensions
  const meta = await sharp(originalBuf).metadata();
  const currentWidth = meta.width ?? 512;
  const currentHeight = meta.height ?? 512;

  // Scale factor: sqrt(targetBytes / currentBytes) keeps area proportional
  const scale = Math.sqrt(targetBytes / currentBytes);
  const newWidth = Math.max(1, Math.round(currentWidth * scale));
  const newHeight = Math.max(1, Math.round(currentHeight * scale));

  const resizedBuf = await sharp(originalBuf)
    .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  return bufferToDataUrl(resizedBuf, 'image/png');
}

/**
 * Ensure the total JSON body fits within `maxMib` MiB.
 * Resizes reference images in-place (smallest images first) if needed.
 */
async function enforceBodyLimit(
  referenceImages: string[],
  restOfPayloadBytes: number,
  maxMib: number,
): Promise<string[]> {
  const maxBytes = maxMib * MIB;
  let images = [...referenceImages];

  // Fast path: already within limit
  const currentImageBytes = images.reduce(
    (sum, img) => sum + Buffer.byteLength(img, 'utf8'),
    0,
  );
  if (restOfPayloadBytes + currentImageBytes <= maxBytes) return images;

  // Budget for images alone
  const imageBudgetBytes = maxBytes - restOfPayloadBytes;
  if (imageBudgetBytes <= 0) {
    // No room for any images — return empty
    return [];
  }

  // Target per image (equal distribution)
  const perImageBudget = Math.floor(imageBudgetBytes / images.length);

  images = await Promise.all(
    images.map((img) => resizeReferenceImage(img, perImageBudget)),
  );

  return images;
}

// ─── Domain allowlist check ───────────────────────────────────────────────────

/**
 * Validate that the host of a data URL is in the allowedDomains list.
 *
 * Data URLs ("data:…") don't have a host, so they are always allowed.
 * Any other URL must have its hostname in allowedDomains.
 */
function checkDomain(url: string, allowedDomains: string[]): void {
  if (url.startsWith('data:')) return; // data URIs are inherently local

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `[image-provider] Invalid reference image URL: "${url.slice(0, 80)}"`,
    );
  }

  if (!allowedDomains.includes(parsed.hostname)) {
    throw new Error(
      `[image-provider] Reference image domain "${parsed.hostname}" is not in allowedDomains`,
    );
  }
}

// ─── RodiumAI API types ───────────────────────────────────────────────────────

interface RodiumImageRequest {
  model: string;
  prompt: string;
  width: number;
  height: number;
  reference_images?: string[];
}

interface RodiumImageResponse {
  data?: Array<{ b64_json?: string }>;
  /** RodiumAI may report cost in credits */
  cost?: number;
  model?: string;
}

// ─── Project-id extraction from idempotency key ───────────────────────────────

/**
 * The idempotency key is expected to have the shape:
 *   <projectId>_<supportType>_<charterVersion>   (or similar prefix_… structure)
 *
 * We extract the first segment as the project_id for cost recording.
 * If the key does not match the expected format we use the full key as a fallback.
 */
function extractProjectId(idempotencyKey: string): string {
  const parts = idempotencyKey.split('_');
  return parts[0] ?? idempotencyKey;
}

// ─── RodiumAIImageProvider ────────────────────────────────────────────────────

export class RodiumAIImageProvider implements ImageProvider {
  private readonly config: ImageProviderConfig;

  constructor(config: ImageProviderConfig) {
    this.config = config;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const { idempotencyKey } = request;
    const operation = 'image_generation';

    // ── 1. Idempotency check ─────────────────────────────────────────────────
    const existing = await getAsset(idempotencyKey);
    if (existing && existing.status === 'done' && existing.storage_path) {
      log.info('[image-provider] Cache hit — returning existing asset', {
        step: 'image_generation',
        projectId: extractProjectId(idempotencyKey),
      });

      // The storage_path contains the base64 result when the asset is stored
      // in-memory; for assets stored in Supabase Storage the caller will
      // handle retrieval. We return what is available.
      return {
        imageBase64: existing.storage_path,
        model: this.config.model,
        estimatedCost: 0,
        attempts: 0,
        fromCache: true,
      };
    }

    // ── 2. Domain validation for reference images ────────────────────────────
    for (const refImg of request.referenceImages ?? []) {
      checkDomain(refImg, this.config.allowedDomains);
    }

    // ── 3. Enforce request body size limit ───────────────────────────────────
    let referenceImages = request.referenceImages ?? [];

    if (referenceImages.length > 0) {
      // Estimate size of the payload without reference images
      const basePayload: RodiumImageRequest = {
        model: request.model ?? this.config.model,
        prompt: request.prompt,
        width: request.width,
        height: request.height,
      };
      const baseBytes = estimateBodyBytes(basePayload);

      referenceImages = await enforceBodyLimit(
        referenceImages,
        baseBytes,
        this.config.maxRequestBodyMib,
      );
    }

    // ── 4. Build request payload ─────────────────────────────────────────────
    const model = request.model ?? this.config.model;
    const apiUrl = env.RODIUMAI_BASE_URL + this.config.endpoint;

    const payload: RodiumImageRequest = {
      model,
      prompt: request.prompt,
      width: request.width,
      height: request.height,
      ...(referenceImages.length > 0 && { reference_images: referenceImages }),
    };

    // ── 5. Retry loop ────────────────────────────────────────────────────────
    let lastError: unknown;
    let totalAttempts = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      totalAttempts = attempt + 1;

      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.RODIUMAI_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        // Network-level failure — retry with backoff
        lastError = networkErr;

        if (attempt < this.config.maxRetries) {
          const delayMs = backoffDelayMs(attempt);
          log.warn('[image-provider] Network error, retrying', {
            step: 'image_generation',
            projectId: extractProjectId(idempotencyKey),
            error: {
              code: 'NETWORK_ERROR',
              model,
              operation,
              attempts: totalAttempts,
            },
          });
          await sleep(delayMs);
          continue;
        }
        break;
      }

      // ── 429: respect Retry-After ─────────────────────────────────────────
      if (response.status === 429) {
        lastError = new Error(`HTTP 429`);

        if (attempt < this.config.maxRetries) {
          const retryAfterMs = parseRetryAfterMs(
            response.headers.get('Retry-After'),
            backoffDelayMs(attempt),
          );
          log.warn('[image-provider] Rate limited (429), waiting before retry', {
            step: 'image_generation',
            projectId: extractProjectId(idempotencyKey),
            error: {
              code: 'HTTP_429',
              model,
              operation,
              attempts: totalAttempts,
            },
          });
          await sleep(retryAfterMs);
          continue;
        }
        break;
      }

      // ── Other 5xx: exponential backoff ───────────────────────────────────
      if (response.status >= 500 && response.status <= 599) {
        lastError = new Error(`HTTP ${response.status}`);

        if (attempt < this.config.maxRetries) {
          const delayMs = backoffDelayMs(attempt);
          log.warn(`[image-provider] Server error (${response.status}), retrying`, {
            step: 'image_generation',
            projectId: extractProjectId(idempotencyKey),
            error: {
              code: `HTTP_${response.status}`,
              model,
              operation,
              attempts: totalAttempts,
            },
          });
          await sleep(delayMs);
          continue;
        }
        break;
      }

      // ── Non-retryable HTTP error ─────────────────────────────────────────
      if (!response.ok) {
        throw new StructuredImageError(
          model,
          operation,
          totalAttempts,
          `[image-provider] Non-retryable HTTP ${response.status}`,
        );
      }

      // ── Success ──────────────────────────────────────────────────────────
      const json = (await response.json()) as RodiumImageResponse;

      const imageBase64 = json.data?.[0]?.b64_json ?? '';
      const declaredCost: number | undefined =
        typeof json.cost === 'number' ? json.cost : undefined;
      const estimatedCost = declaredCost ?? this.config.unitPriceRodi;
      const resolvedModel = json.model ?? model;

      // ── 6. Record cost ────────────────────────────────────────────────────
      const projectId = extractProjectId(idempotencyKey);
      recordCost({
        project_id: projectId,
        provider: 'rodiumai',
        model: resolvedModel,
        operation,
        declared_cost: declaredCost ?? null,
        estimated_cost: estimatedCost,
        attempts: totalAttempts,
      }).catch((err: unknown) => {
        log.error('[image-provider] Failed to record cost', {
          step: 'image_generation',
          projectId,
          error: err,
        });
      });

      log.info('[image-provider] Image generated successfully', {
        step: 'image_generation',
        projectId,
      });

      return {
        imageBase64,
        model: resolvedModel,
        ...(declaredCost !== undefined && { declaredCost }),
        estimatedCost,
        attempts: totalAttempts,
        fromCache: false,
      };
    }

    // ── 7. Max retries exhausted ─────────────────────────────────────────────
    log.error('[image-provider] Max retries exhausted', {
      step: 'image_generation',
      projectId: extractProjectId(idempotencyKey),
      error: {
        code: 'MAX_RETRIES_EXHAUSTED',
        model,
        operation,
        attempts: totalAttempts,
      },
    });

    throw new StructuredImageError(
      model,
      operation,
      totalAttempts,
      `[image-provider] Image generation failed after ${totalAttempts} attempt(s)`,
    );
  }
}

// ─── Factory function ─────────────────────────────────────────────────────────

/**
 * Create a RodiumAIImageProvider with merged defaults.
 * Callers may override any subset of ImageProviderConfig fields.
 */
export function createRodiumAIImageProvider(
  config?: Partial<ImageProviderConfig>,
): RodiumAIImageProvider {
  const merged: ImageProviderConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  return new RodiumAIImageProvider(merged);
}
