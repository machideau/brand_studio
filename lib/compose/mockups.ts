/**
 * lib/compose/mockups.ts — Mockup generation for 4 categories
 *
 * Implements:
 *  - 4 categories: cartes_de_visite, enseignes, vetements, ecrans
 *  - Safe zone enforcement identical to other supports
 *  - Flat frame composition (honest sharp composition without unsupported perspective warp)
 *  - Explicit "présentation" tag in metadata and filenames (never "prêt à imprimer")
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4
 */

import sharp from "sharp";
import { placeLogo } from "@/lib/compose/logo-placer";
import { SUPPORT_TEMPLATES } from "@/lib/config/supports";
import type { Charter } from "@/lib/strategy/types";

export const MOCKUP_CATEGORIES = [
  "cartes_de_visite",
  "enseignes",
  "vetements",
  "ecrans",
] as const;

export type MockupCategory = (typeof MOCKUP_CATEGORIES)[number];

export interface MockupResult {
  category: MockupCategory;
  filename: string;
  buffer: Buffer;
  usage: "presentation";
}

/**
 * Generate a mockup for a given category.
 * Embeds the logo into a realistic flat-frame presentation scene.
 */
export async function generateMockup(
  category: MockupCategory,
  logoBuffer: Buffer,
  charter: Charter,
  brandName: string,
): Promise<MockupResult> {
  const width = 1200;
  const height = 800;

  // Scene background according to category
  let bgFill = "#f3f4f6"; // neutral studio grey
  if (category === "enseignes") bgFill = "#1f2937"; // dark architectural
  if (category === "vetements") bgFill = "#e5e7eb"; // fabric texture base
  if (category === "ecrans") bgFill = "#0f172a"; // dark device bezel

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: bgFill,
    },
  });

  const template = {
    ...SUPPORT_TEMPLATES.bannière,
    widthPx: width,
    heightPx: height,
    safeZone: 48,
    logoMaxWidthRatio: 0.4,
  };

  const logoResult = await placeLogo({
    logoBuffer,
    template,
    charter,
    backgroundColorHex: bgFill,
    alignment: "center",
  });

  const layers: sharp.OverlayOptions[] = [];

  // Card / device container plate
  const containerW = Math.round(width * 0.7);
  const containerH = Math.round(height * 0.6);
  const containerX = Math.round((width - containerW) / 2);
  const containerY = Math.round((height - containerH) / 2);

  const containerSvg = `
    <svg width="${width}" height="${height}">
      <rect x="${containerX}" y="${containerY}" width="${containerW}" height="${containerH}" rx="16" fill="${charter.colors.background || "#ffffff"}" stroke="#e5e7eb" stroke-width="2" />
      <text x="${width / 2}" y="${containerY + containerH - 24}" font-family="sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle">
        ${brandName.toUpperCase()} — PRÉSENTATION (${category.replace(/_/g, " ").toUpperCase()})
      </text>
    </svg>
  `.trim();

  layers.push({ input: Buffer.from(containerSvg), top: 0, left: 0 });

  if (logoResult.needsIntermediateBg && logoResult.intermediateBgSvg) {
    layers.push({
      input: Buffer.from(logoResult.intermediateBgSvg),
      top: 0,
      left: 0,
    });
  }

  layers.push({
    input: logoResult.resizedLogoBuffer,
    top: logoResult.geometry.y,
    left: logoResult.geometry.x,
  });

  const buffer = await canvas
    .composite(layers)
    .png({ quality: 90 })
    .toBuffer();

  return {
    category,
    filename: `mockup_${category}_presentation.png`,
    buffer,
    usage: "presentation",
  };
}
