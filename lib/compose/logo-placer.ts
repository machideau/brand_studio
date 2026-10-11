/**
 * lib/compose/logo-placer.ts — Logo positioning, sizing & WCAG contrast verification
 *
 * Implements:
 *  - Calculation of placed logo dimensions respecting exact original aspect ratio
 *    with tolerance |ratio_composé / ratio_original - 1| <= 0.01
 *  - Safe zone enforcement from SupportTemplate and Charter
 *  - WCAG 2.1 relative luminance and contrast ratio calculations
 *  - Automated generation of intermediate contrast background when contrast is insufficient
 *
 * Requirements: 13.1, 13.2, 13.3, 13.6
 */

import sharp from "sharp";
import type { SupportTemplate } from "@/lib/config/supports";
import type { Charter } from "@/lib/strategy/types";

// ---------------------------------------------------------------------------
// WCAG Luminance & Contrast
// ---------------------------------------------------------------------------

/**
 * Parse a 6-digit hex string (#rrggbb) into RGB channel values in [0, 255].
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calculate WCAG 2.1 relative luminance for an sRGB colour in [0, 1].
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((val) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/**
 * Calculate WCAG 2.1 contrast ratio between two hex colours (>= 1.0).
 */
export function calculateContrastRatio(colorA: string, colorB: string): number {
  const l1 = getRelativeLuminance(colorA);
  const l2 = getRelativeLuminance(colorB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlacedLogoGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
  aspectRatio: number;
  ratioDeviation: number;
}

export interface PlacedLogoResult {
  geometry: PlacedLogoGeometry;
  resizedLogoBuffer: Buffer;
  contrastRatio: number;
  needsIntermediateBg: boolean;
  intermediateBgSvg?: string;
}

export interface PlacementOptions {
  logoBuffer: Buffer;
  template: SupportTemplate;
  charter: Charter;
  backgroundColorHex?: string;
  logoDominantColorHex?: string;
  alignment?: "center" | "top" | "left";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate strict proportions and layout coordinates for placing the logo.
 * Enforces Property 5: |ratio_composé / ratio_original - 1| <= 0.01.
 */
export async function calculateLogoPlacement(
  logoBuffer: Buffer,
  template: SupportTemplate,
  charter: Charter,
  alignment: "center" | "top" | "left" = "center",
): Promise<PlacedLogoGeometry> {
  const metadata = await sharp(logoBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read logo dimensions from buffer");
  }

  const origW = metadata.width;
  const origH = metadata.height;
  const origRatio = origW / origH;

  const effectiveSafeZone = Math.max(
    template.safeZone,
    (charter.logoRules?.safeZone ?? 0) * (charter.spacingUnit || 8),
  );

  const availableW = Math.max(
    10,
    (template.widthPx - template.margins.left - template.margins.right - effectiveSafeZone * 2) *
      template.logoMaxWidthRatio,
  );

  const availableH = Math.max(
    10,
    (template.heightPx - template.margins.top - template.margins.bottom - effectiveSafeZone * 2) *
      0.55,
  );

  const scale = Math.min(availableW / origW, availableH / origH);
  let placedW = Math.max(1, Math.round(origW * scale));
  let placedH = Math.max(1, Math.round(origH * scale));

  // Fine-tune by 1px if necessary to preserve ratio within 1% invariant
  let placedRatio = placedW / placedH;
  let ratioDeviation = Math.abs(placedRatio / origRatio - 1);

  if (ratioDeviation > 0.01) {
    placedH = Math.round(placedW / origRatio);
    placedRatio = placedW / placedH;
    ratioDeviation = Math.abs(placedRatio / origRatio - 1);
  }

  // Calculate coordinates based on alignment
  let x = Math.round((template.widthPx - placedW) / 2);
  let y = Math.round((template.heightPx - placedH) / 2);

  if (alignment === "top") {
    y = Math.round(template.margins.top + effectiveSafeZone);
  } else if (alignment === "left") {
    x = Math.round(template.margins.left + effectiveSafeZone);
  }

  return {
    width: placedW,
    height: placedH,
    x,
    y,
    aspectRatio: placedRatio,
    ratioDeviation,
  };
}

/**
 * Place the logo, check contrast against background, and prepare intermediate badge if needed.
 */
export async function placeLogo(options: PlacementOptions): Promise<PlacedLogoResult> {
  const {
    logoBuffer,
    template,
    charter,
    backgroundColorHex = charter.colors.background,
    logoDominantColorHex = charter.colors.primary,
    alignment = "center",
  } = options;

  const geometry = await calculateLogoPlacement(logoBuffer, template, charter, alignment);

  // Resize logo strictly to calculated dimensions
  const resizedLogoBuffer = await sharp(logoBuffer)
    .resize(geometry.width, geometry.height, { fit: "fill" })
    .png()
    .toBuffer();

  // Contrast check (WCAG AA graphic threshold = 3.0:1)
  const contrastRatio = calculateContrastRatio(logoDominantColorHex, backgroundColorHex);
  const needsIntermediateBg = contrastRatio < 3.0;

  let intermediateBgSvg: string | undefined;

  if (needsIntermediateBg) {
    const pad = Math.max(16, template.safeZone);
    const bgW = geometry.width + pad * 2;
    const bgH = geometry.height + pad * 2;
    const bgX = geometry.x - pad;
    const bgY = geometry.y - pad;

    // Pick a contrasting pill background
    const bgFill =
      getRelativeLuminance(backgroundColorHex) > 0.5 ? "#ffffff" : "#1a1a1a";
    const bgOpacity = 0.85;

    intermediateBgSvg = `
      <svg width="${template.widthPx}" height="${template.heightPx}">
        <rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="${Math.round(pad / 2)}" ry="${Math.round(pad / 2)}" fill="${bgFill}" fill-opacity="${bgOpacity}" />
      </svg>
    `.trim();
  }

  return {
    geometry,
    resizedLogoBuffer,
    contrastRatio,
    needsIntermediateBg,
    intermediateBgSvg,
  };
}
