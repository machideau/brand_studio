import sharp from "sharp";
import { sanitizeSvg, svgToPng } from "./svg-sanitize";

/** Maximum allowed file size: 20 MB */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum allowed image dimensions */
const MAX_DIMENSION_PX = 10000;

/** PNG magic bytes: 89 50 4E 47 */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** JPEG magic bytes: FF D8 FF */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export type FileType = "png" | "jpeg" | "svg" | "unknown";

/**
 * Detects the real file type by inspecting magic bytes (PNG, JPEG) or
 * searching for the <svg tag within the first 4 KB of UTF-8 content (SVG).
 * The declared extension or MIME type is intentionally ignored.
 */
export function detectFileType(buffer: Buffer): FileType {
  if (buffer.length < 4) {
    return "unknown";
  }

  // Check PNG: bytes 0–3 = 89 50 4E 47
  if (
    buffer[0] === PNG_MAGIC[0] &&
    buffer[1] === PNG_MAGIC[1] &&
    buffer[2] === PNG_MAGIC[2] &&
    buffer[3] === PNG_MAGIC[3]
  ) {
    return "png";
  }

  // Check JPEG: bytes 0–2 = FF D8 FF
  if (
    buffer[0] === JPEG_MAGIC[0] &&
    buffer[1] === JPEG_MAGIC[1] &&
    buffer[2] === JPEG_MAGIC[2]
  ) {
    return "jpeg";
  }

  // Check SVG: look for <svg (case-insensitive) in the first 4 KB as UTF-8
  const head = buffer.slice(0, Math.min(buffer.length, 4096)).toString("utf8");
  if (/<svg[\s>]/i.test(head)) {
    return "svg";
  }

  return "unknown";
}

export interface ValidationResult {
  valid: boolean;
  type?: "png" | "jpeg" | "svg";
  /** Sanitized SVG string (only present when type === 'svg') */
  sanitizedSvg?: string;
  /** Rasterised PNG buffer for SVG inputs (for downstream processing) */
  processedBuffer?: Buffer;
  error?: string;
}

/**
 * Validates a logo file buffer.
 *
 * Checks performed (in order):
 * 1. Real file type via magic bytes (must be PNG, JPEG or SVG)
 * 2. File size (must not exceed 20 MB)
 * 3. For SVG: sanitise first, then check dimensions from width/height attributes
 * 4. For raster images (PNG/JPEG): check dimensions via sharp
 *
 * The original buffer is never modified; sanitisation produces a new string/buffer.
 */
export async function validateLogoFile(
  buffer: Buffer,
  _filename: string
): Promise<ValidationResult> {
  // 1. Detect real type
  const type = detectFileType(buffer);

  if (type === "unknown") {
    return {
      valid: false,
      error:
        "Type de fichier non reconnu. Seuls les formats PNG, JPEG et SVG sont acceptés.",
    };
  }

  // 2. Size check
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      type,
      error: `Le fichier dépasse la taille maximale autorisée de 20 Mo (taille reçue : ${(buffer.length / 1024 / 1024).toFixed(1)} Mo).`,
    };
  }

  // 3. SVG handling: sanitise then check dimensions
  if (type === "svg") {
    const svgString = buffer.toString("utf8");
    const sanitized = sanitizeSvg(svgString);

    // Parse SVG width/height attributes for dimension check
    const dims = parseSvgDimensions(sanitized);
    if (dims !== null) {
      if (dims.width > MAX_DIMENSION_PX || dims.height > MAX_DIMENSION_PX) {
        return {
          valid: false,
          type,
          error: `Les dimensions du SVG (${dims.width}×${dims.height} px) dépassent la limite maximale de ${MAX_DIMENSION_PX}×${MAX_DIMENSION_PX} px.`,
        };
      }
    }

    // Rasterise the sanitised SVG to PNG for downstream processing
    let processedBuffer: Buffer | undefined;
    try {
      const sanitizedBuffer = Buffer.from(sanitized, "utf8");
      processedBuffer = await svgToPng(sanitizedBuffer);
    } catch {
      // Rasterisation failure is non-fatal for validation itself;
      // downstream modules will handle it
      processedBuffer = undefined;
    }

    return {
      valid: true,
      type,
      sanitizedSvg: sanitized,
      processedBuffer,
    };
  }

  // 4. Raster image dimension check via sharp (PNG / JPEG)
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return {
      valid: false,
      type,
      error: "Impossible de lire les métadonnées de l'image (fichier corrompu).",
    };
  }

  const w = metadata.width ?? 0;
  const h = metadata.height ?? 0;

  if (w > MAX_DIMENSION_PX || h > MAX_DIMENSION_PX) {
    return {
      valid: false,
      type,
      error: `Les dimensions de l'image (${w}×${h} px) dépassent la limite maximale de ${MAX_DIMENSION_PX}×${MAX_DIMENSION_PX} px.`,
    };
  }

  return { valid: true, type };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses the `width` and `height` attributes from the root `<svg>` element.
 * Returns null if the attributes are absent or non-numeric (e.g. percentages).
 */
function parseSvgDimensions(
  svgString: string
): { width: number; height: number } | null {
  // Match the opening <svg ...> tag
  const svgTagMatch = svgString.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) return null;

  const attrs = svgTagMatch[1];

  const widthMatch = attrs.match(/\bwidth\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
  const heightMatch = attrs.match(/\bheight\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);

  if (!widthMatch || !heightMatch) return null;

  const width = parseFloat(widthMatch[1]);
  const height = parseFloat(heightMatch[1]);

  if (!isFinite(width) || !isFinite(height)) return null;

  return { width, height };
}
