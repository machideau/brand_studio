import sharp from "sharp";

/**
 * Sanitizes an SVG string by removing dangerous content:
 * - All <script> tags and their content
 * - All event handler attributes (on* attributes)
 * - External URL references in href, src, xlink:href pointing to http/https
 */
export function sanitizeSvg(svgString: string): string {
  let result = svgString;

  // Remove all <script> tags and their content (case-insensitive, multiline)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // Also remove self-closing script tags
  result = result.replace(/<script\b[^>]*\/>/gi, "");

  // Remove all event handler attributes (on* attributes)
  // Matches attributes like onload="...", onclick='...', onerror=..., etc.
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // Remove external URL references in href attributes pointing to http/https
  result = result.replace(
    /\bhref\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')/gi,
    'href=""'
  );

  // Remove external URL references in src attributes pointing to http/https
  result = result.replace(
    /\bsrc\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')/gi,
    'src=""'
  );

  // Remove external URL references in xlink:href attributes pointing to http/https
  result = result.replace(
    /\bxlink:href\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')/gi,
    'xlink:href=""'
  );

  // Remove external url() references in style attributes/values pointing to http/https
  result = result.replace(/url\s*\(\s*['"]?https?:\/\/[^)'"]*['"]?\s*\)/gi, "url()");

  return result;
}

/**
 * Converts an SVG buffer to a PNG buffer using sharp.
 * No network access occurs; sharp renders the SVG locally.
 *
 * @param svgBuffer - Buffer containing SVG data
 * @param width - Optional output width in pixels
 * @param height - Optional output height in pixels
 * @returns PNG buffer
 */
export async function svgToPng(
  svgBuffer: Buffer,
  width?: number,
  height?: number
): Promise<Buffer> {
  let pipeline = sharp(svgBuffer);

  if (width !== undefined || height !== undefined) {
    pipeline = pipeline.resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  return pipeline.png().toBuffer();
}
