import sharp from 'sharp';
import type { BrandProfile, DominantColor } from './types';

/** Minimum dimension (px) below which `lowResolutionWarning` is set. */
const LOW_RESOLUTION_THRESHOLD = 200;

/** Maximum number of dominant colors to return. */
const MAX_DOMINANT_COLORS = 5;

/**
 * Quantize a channel value (0–255) to the nearest multiple of 32
 * (5-bit per channel). Used for colour clustering.
 */
function quantizeChannel(value: number): number {
  return Math.round(value / 32) * 32;
}

/**
 * Convert R, G, B channel values to a lowercase `#rrggbb` hex string.
 */
function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.min(255, c).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Extract the top-N dominant colors from raw RGBA pixel data.
 *
 * Only opaque pixels (alpha > 0) contribute to the count.
 * Colours are clustered by rounding each R/G/B channel to the nearest 32.
 *
 * @param data   Raw pixel buffer (RGBA, 4 bytes per pixel).
 * @param hasAlpha Whether the source image actually has an alpha channel.
 *                 When false every pixel is considered opaque.
 */
function extractDominantColors(
  data: Buffer,
  hasAlpha: boolean,
): DominantColor[] {
  const counts = new Map<string, number>();
  let totalOpaque = 0;

  const bytesPerPixel = 4; // sharp always outputs RGBA when requesting raw()
  const pixelCount = Math.floor(data.length / bytesPerPixel);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * bytesPerPixel;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    // Skip transparent pixels
    if (hasAlpha && a === 0) continue;

    totalOpaque++;

    const qr = quantizeChannel(r);
    const qg = quantizeChannel(g);
    const qb = quantizeChannel(b);
    const key = toHex(qr, qg, qb);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (totalOpaque === 0) return [];

  // Sort by frequency (descending) and take top N
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topN = sorted.slice(0, MAX_DOMINANT_COLORS);

  return topN.map(([hex, count]) => ({
    hex,
    proportion: count / totalOpaque,
  }));
}

/**
 * Deterministic logo analysis using sharp.
 *
 * Returns the deterministic subset of `BrandProfile` — dimensions, aspect
 * ratio, alpha flag, dominant colors, and the low-resolution warning.
 * The semantic fields (logoType, hasText, …) are intentionally absent here;
 * they are filled in by `semantic.ts`.
 *
 * This function is **pure and deterministic**: given the same input buffer it
 * always produces the same output (Requirement 8.5 / Property 1).
 */
export async function analyzeLogo(
  buffer: Buffer,
): Promise<
  Pick<
    BrandProfile,
    | 'widthPx'
    | 'heightPx'
    | 'aspectRatio'
    | 'hasAlpha'
    | 'dominantColors'
    | 'lowResolutionWarning'
  >
> {
  const metadata = await sharp(buffer).metadata();

  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error('analyzeLogo: could not read image dimensions');
  }

  const hasAlpha = metadata.hasAlpha ?? false;
  const aspectRatio = Math.round((width / height) * 10000) / 10000;
  const lowResolutionWarning =
    width < LOW_RESOLUTION_THRESHOLD || height < LOW_RESOLUTION_THRESHOLD;

  // Decode the full image to raw RGBA so we can iterate over pixels.
  // We force RGBA (4 channels) so the buffer layout is always predictable.
  const rawData = await sharp(buffer)
    .ensureAlpha() // always output 4 channels (RGBA)
    .raw()
    .toBuffer();

  const dominantColors = extractDominantColors(rawData, hasAlpha);

  return {
    widthPx: width,
    heightPx: height,
    aspectRatio,
    hasAlpha,
    dominantColors,
    lowResolutionWarning,
  };
}
