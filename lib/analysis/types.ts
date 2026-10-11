import { z } from 'zod';

export type Uncertain = 'uncertain';

export interface DominantColor {
  hex: string; // '#rrggbb'
  proportion: number; // 0–1
}

export interface BrandProfile {
  // Mesures déterministes (sharp)
  widthPx: number;
  heightPx: number;
  aspectRatio: number; // width / height, arrondi à 4 décimales
  hasAlpha: boolean;
  dominantColors: DominantColor[];
  lowResolutionWarning: boolean;

  // Interprétation sémantique (vision IA) — initialement 'uncertain'
  logoType: 'iconic' | 'wordmark' | 'combination' | 'emblem' | Uncertain;
  hasText: boolean | Uncertain;
  identifiedSymbols: string[] | Uncertain;
  perceivedStyle: string[] | Uncertain;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const dominantColorSchema = z.object({
  hex: z.string().regex(/^#[0-9a-f]{6}$/, 'hex must be #rrggbb'),
  proportion: z.number().min(0).max(1),
});

/** Schema covering only the deterministic fields produced by sharp. */
export const deterministicBrandProfileSchema = z.object({
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  hasAlpha: z.boolean(),
  dominantColors: z.array(dominantColorSchema),
  lowResolutionWarning: z.boolean(),
});

/** Full BrandProfile schema including semantic fields (may be 'uncertain'). */
export const brandProfileSchema = deterministicBrandProfileSchema.extend({
  logoType: z.union([
    z.enum(['iconic', 'wordmark', 'combination', 'emblem']),
    z.literal('uncertain'),
  ]),
  hasText: z.union([z.boolean(), z.literal('uncertain')]),
  identifiedSymbols: z.union([z.array(z.string()), z.literal('uncertain')]),
  perceivedStyle: z.union([z.array(z.string()), z.literal('uncertain')]),
});

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a BrandProfile to a JSON string.
 * The resulting string can be safely stored and later restored via `deserialize`.
 */
export function serialize(profile: BrandProfile): string {
  return JSON.stringify(profile);
}

/**
 * Deserialize a JSON string into a validated BrandProfile.
 * Throws a ZodError if the data does not match the expected schema.
 */
export function deserialize(json: string): BrandProfile {
  const data: unknown = JSON.parse(json);
  return brandProfileSchema.parse(data);
}
