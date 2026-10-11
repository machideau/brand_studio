/**
 * lib/strategy/types.ts — Charte graphique types + zod schema
 *
 * Exigences : 10.3
 */

import { z } from 'zod';

// ─── Hex color validation ─────────────────────────────────────────────────────

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex string (#rrggbb)');

// ─── ColorPalette ─────────────────────────────────────────────────────────────

export interface ColorPalette {
  primary: string;    // hex
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export const colorPaletteSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  background: hexColor,
  text: hexColor,
});

// ─── TypographyScale ──────────────────────────────────────────────────────────

export interface TypographyScale {
  xs: number;   // px
  sm: number;
  base: number;
  lg: number;
  xl: number;
  xxl: number;
}

export const typographyScaleSchema = z.object({
  xs: z.number().positive(),
  sm: z.number().positive(),
  base: z.number().positive(),
  lg: z.number().positive(),
  xl: z.number().positive(),
  xxl: z.number().positive(),
});

// ─── Charter ─────────────────────────────────────────────────────────────────

export interface Charter {
  colors: ColorPalette;
  primaryFont: string;      // OFL font family name
  secondaryFont: string;
  typographyScale: TypographyScale;
  spacingUnit: number;      // px (default 8)
  visualStyle: string[];    // e.g. ['minimaliste', 'géométrique']
  logoRules: {
    safeZone: number;               // multiple of spacingUnit
    minSize: number;                // px
    allowedBackgrounds: string[];
    forbiddenBackgrounds: string[];
  };
  forbidden: string[];      // explicit prohibitions
  version: number;          // incremented on each regeneration
}

export const charterSchema = z.object({
  colors: colorPaletteSchema,
  primaryFont: z.string().min(1),
  secondaryFont: z.string().min(1),
  typographyScale: typographyScaleSchema,
  spacingUnit: z.number().positive(),
  visualStyle: z.array(z.string()),
  logoRules: z.object({
    safeZone: z.number().nonnegative(),
    minSize: z.number().positive(),
    allowedBackgrounds: z.array(z.string()),
    forbiddenBackgrounds: z.array(z.string()),
  }),
  forbidden: z.array(z.string()),
  version: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a Charter to a JSON string.
 * The resulting string can be safely stored and later restored via `deserialize`.
 */
export function serialize(charter: Charter): string {
  return JSON.stringify(charter);
}

/**
 * Deserialize a JSON string into a validated Charter.
 * Throws a ZodError if the data does not match the expected schema.
 */
export function deserialize(json: string): Charter {
  const data: unknown = JSON.parse(json);
  return charterSchema.parse(data);
}
