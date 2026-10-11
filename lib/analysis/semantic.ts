/**
 * lib/analysis/semantic.ts — Semantic logo analysis via RodiumAI vision
 *
 * Sends the logo image to the RodiumAI vision model and extracts:
 *  - logoType   : 'iconic' | 'wordmark' | 'combination' | 'emblem'
 *  - hasText    : boolean
 *  - identifiedSymbols : string[]
 *  - perceivedStyle    : string[]
 *
 * Security rules (Req 9.2, 9.4, 25.3):
 *  - All text returned by the model is treated as untrusted:
 *    lengths are validated before any usage.
 *  - On schema mismatch every non-conforming field is set to 'uncertain'.
 *    This function never throws on invalid model output.
 *  - The raw model response is never logged in plain text.
 *
 * Image size rule (Req 9.3):
 *  - The image is resized to < 10 MiB before sending.
 *
 * Exigences : 9.1, 9.2, 9.3, 9.4
 */

import sharp from 'sharp';
import { vision } from '@/lib/ai/llm-client';
import { log } from '@/lib/logger';
import type { BrandProfile } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum image size accepted by RodiumAI vision (10 MiB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum allowed length of each string item returned by the model.
 * Strings longer than this are discarded (treated as untrusted oversized input).
 */
const MAX_STRING_ITEM_LENGTH = 200;

/**
 * Maximum number of items allowed in the symbol / style arrays returned by
 * the model. Arrays larger than this are treated as non-conforming.
 */
const MAX_ARRAY_ITEMS = 50;

const UNCERTAIN = 'uncertain' as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type SemanticResult = Pick<
  BrandProfile,
  'logoType' | 'hasText' | 'identifiedSymbols' | 'perceivedStyle'
>;

// The raw JSON shape we ask the vision model to return.
interface RawVisionResponse {
  logoType?: unknown;
  hasText?: unknown;
  identifiedSymbols?: unknown;
  perceivedStyle?: unknown;
}

// ─── Image resizing ───────────────────────────────────────────────────────────

/**
 * Ensure the image buffer is smaller than MAX_IMAGE_BYTES.
 *
 * Strategy: progressively reduce quality (JPEG) until the target size is met.
 * Starts at 90 % quality, drops by 10 % each step.
 * If quality hits a floor of 40 % and the image is still too large, scale down
 * the dimensions by 50 % as a last resort.
 */
async function resizeIfNeeded(buffer: Buffer): Promise<Buffer> {
  if (buffer.length < MAX_IMAGE_BYTES) return buffer;

  log.info('[semantic] Image exceeds 10 MiB, resizing before vision call', {
    step: 'analyze_logo',
  });

  let current = buffer;
  let quality = 90;

  while (current.length >= MAX_IMAGE_BYTES && quality >= 40) {
    current = await sharp(current)
      .jpeg({ quality })
      .toBuffer();
    quality -= 10;
  }

  // Last resort: halve the dimensions
  if (current.length >= MAX_IMAGE_BYTES) {
    const meta = await sharp(buffer).metadata();
    const halfWidth = Math.max(1, Math.floor((meta.width ?? 1000) / 2));
    current = await sharp(buffer)
      .resize({ width: halfWidth })
      .jpeg({ quality: 60 })
      .toBuffer();
  }

  return current;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const VISION_PROMPT = `Analyze this logo image and respond with a single JSON object (no markdown fences, no extra text).

The JSON must have exactly these four keys:

{
  "logoType": "<one of: iconic | wordmark | combination | emblem>",
  "hasText": <true | false>,
  "identifiedSymbols": ["<symbol 1>", "<symbol 2>", ...],
  "perceivedStyle": ["<style keyword 1>", "<style keyword 2>", ...]
}

Definitions:
- iconic: the logo is purely a symbol/icon with no text.
- wordmark: the logo is purely the brand name in a stylized typeface, no separate icon.
- combination: the logo combines a symbol/icon AND text/wordmark.
- emblem: text and symbol are enclosed within a badge, seal or crest shape.
- identifiedSymbols: short descriptors of visual symbols or shapes present (e.g., "star", "leaf", "circle", "letter A").
- perceivedStyle: stylistic impressions (e.g., "minimalist", "geometric", "hand-drawn", "vintage", "corporate").

Respond ONLY with the JSON object.`;

// ─── Response parsing & validation ───────────────────────────────────────────

const VALID_LOGO_TYPES = ['iconic', 'wordmark', 'combination', 'emblem'] as const;
type ValidLogoType = (typeof VALID_LOGO_TYPES)[number];

/** Validate a single string item from the model: must be a non-empty string under the max length. */
function isValidStringItem(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_STRING_ITEM_LENGTH
  );
}

/** Sanitize an array of strings from the model. Non-string or oversized items are dropped. */
function sanitizeStringArray(value: unknown): string[] | typeof UNCERTAIN {
  if (!Array.isArray(value)) return UNCERTAIN;
  if (value.length > MAX_ARRAY_ITEMS) return UNCERTAIN;

  // Filter out invalid items (length-check before any usage — Req 9.4)
  const valid = value.filter(isValidStringItem) as string[];

  // If every item was invalid, treat the whole field as uncertain
  if (valid.length === 0 && value.length > 0) return UNCERTAIN;

  return valid;
}

/**
 * Parse the raw JSON string returned by the vision model.
 * Returns a RawVisionResponse on success, or null if parsing fails.
 */
function parseVisionJson(raw: string): RawVisionResponse | null {
  // Guard: validate length before any processing (Req 9.4)
  if (raw.length > 100_000) {
    log.warn('[semantic] Vision response too long, discarding', {
      step: 'analyze_logo',
    });
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as RawVisionResponse;
  } catch {
    // The model may wrap JSON in markdown fences despite the instruction.
    // Try to extract JSON from ```json ... ``` or ``` ... ``` blocks.
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    if (fenceMatch) {
      try {
        const inner: unknown = JSON.parse(fenceMatch[1].trim());
        if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
          return inner as RawVisionResponse;
        }
      } catch {
        // fall through
      }
    }
    return null;
  }
}

/**
 * Convert a raw vision response into a validated SemanticResult.
 *
 * Any field that does not conform to the expected schema is replaced with
 * 'uncertain'. This function never throws (Req 9.2).
 */
function validateVisionResponse(raw: RawVisionResponse | null): SemanticResult {
  if (raw === null) {
    return {
      logoType: UNCERTAIN,
      hasText: UNCERTAIN,
      identifiedSymbols: UNCERTAIN,
      perceivedStyle: UNCERTAIN,
    };
  }

  // logoType
  const logoType: BrandProfile['logoType'] =
    typeof raw.logoType === 'string' &&
    (VALID_LOGO_TYPES as readonly string[]).includes(raw.logoType)
      ? (raw.logoType as ValidLogoType)
      : UNCERTAIN;

  // hasText
  const hasText: BrandProfile['hasText'] =
    typeof raw.hasText === 'boolean' ? raw.hasText : UNCERTAIN;

  // identifiedSymbols
  const identifiedSymbols: BrandProfile['identifiedSymbols'] =
    sanitizeStringArray(raw.identifiedSymbols);

  // perceivedStyle
  const perceivedStyle: BrandProfile['perceivedStyle'] =
    sanitizeStringArray(raw.perceivedStyle);

  return { logoType, hasText, identifiedSymbols, perceivedStyle };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a logo image semantically using RodiumAI vision.
 *
 * Steps:
 *  1. Resize the image to < 10 MiB if necessary.
 *  2. Encode as base64.
 *  3. Call the vision model with a structured JSON prompt.
 *  4. Parse and validate the JSON response.
 *  5. Return validated semantic fields — non-conforming fields are 'uncertain'.
 *
 * This function never throws on invalid model output (Req 9.2).
 * All string values from the model are length-validated before use (Req 9.4).
 *
 * @param buffer    Raw image buffer (PNG, JPEG, or converted SVG).
 * @param projectId Project UUID for cost tracking.
 */
export async function analyzeLogoSemantic(
  buffer: Buffer,
  projectId: string,
): Promise<
  Pick<BrandProfile, 'logoType' | 'hasText' | 'identifiedSymbols' | 'perceivedStyle'>
> {
  log.info('[semantic] Starting semantic logo analysis', {
    step: 'analyze_logo',
    projectId,
  });

  try {
    // 1. Resize image to < 10 MiB (Req 9.3)
    const resizedBuffer = await resizeIfNeeded(buffer);

    // 2. Encode as base64 for the vision API
    const imageBase64 = resizedBuffer.toString('base64');

    // 3. Call vision model
    const result = await vision(imageBase64, VISION_PROMPT, { projectId });

    // 4. Parse the raw response (treat as untrusted — Req 9.4)
    const parsed = parseVisionJson(result.content);

    // 5. Validate and return — fields that don't conform become 'uncertain' (Req 9.2)
    const semantic = validateVisionResponse(parsed);

    log.info('[semantic] Semantic analysis completed', {
      step: 'analyze_logo',
      projectId,
    });

    return semantic;
  } catch (err) {
    // Log the error without exposing model content (Req 25.3)
    log.error('[semantic] Vision call failed, returning uncertain for all semantic fields', {
      step: 'analyze_logo',
      projectId,
      error: err,
    });

    // Graceful degradation: return all fields as 'uncertain' (Req 9.2)
    return {
      logoType: UNCERTAIN,
      hasText: UNCERTAIN,
      identifiedSymbols: UNCERTAIN,
      perceivedStyle: UNCERTAIN,
    };
  }
}
