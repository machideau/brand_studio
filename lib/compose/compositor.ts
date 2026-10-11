/**
 * lib/compose/compositor.ts — Main graphical compositor
 *
 * Orchestrates Sharp and Satori to combine AI backgrounds, logos, and typography:
 *  1. Base canvas at exact support dimensions (background image or charter colour)
 *  2. Logo placement with strict invariant checking and safe zones
 *  3. Intermediate contrast badge when WCAG contrast is < 3:1
 *  4. Typography rendering via Satori
 *  5. Final PNG composite strictly matching target dimensions
 *
 * Requirements: 13.1, 13.2, 13.4, 13.5, 13.6
 */

import sharp from "sharp";
import type { SupportTemplate } from "@/lib/config/supports";
import { placeLogo } from "@/lib/compose/logo-placer";
import { renderBrandTextToSvg } from "@/lib/compose/text-renderer";
import type { Charter } from "@/lib/strategy/types";

export interface ComposeOptions {
  template: SupportTemplate;
  charter: Charter;
  logoBuffer: Buffer;
  brandName: string;
  tagline?: string;
  aiBackgroundBuffer?: Buffer;
}

export interface ComposeResult {
  outputBuffer: Buffer;
  width: number;
  height: number;
  supportId: string;
}

/**
 * Composite a complete brand asset for a given support.
 */
export async function composeAsset(options: ComposeOptions): Promise<ComposeResult> {
  const {
    template,
    charter,
    logoBuffer,
    brandName,
    tagline,
    aiBackgroundBuffer,
  } = options;

  const targetW = template.widthPx;
  const targetH = template.heightPx;

  // 1. Prepare base background canvas
  let baseCanvas: sharp.Sharp;

  if (aiBackgroundBuffer && aiBackgroundBuffer.length > 0) {
    baseCanvas = sharp(aiBackgroundBuffer).resize(targetW, targetH, {
      fit: "cover",
      position: "center",
    });
  } else {
    // Generate solid background from charter
    baseCanvas = sharp({
      create: {
        width: targetW,
        height: targetH,
        channels: 4,
        background: charter.colors.background || "#ffffff",
      },
    });
  }

  // 2. Determine layout strategy according to support type
  const isAvatar = template.id === "avatar";
  const isBanner = template.id === "bannière";
  const isVertical = template.id === "publication_verticale";

  let logoAlignment: "center" | "top" | "left" = "center";
  if (isBanner) {
    logoAlignment = "left";
  } else if (!isAvatar) {
    logoAlignment = "top";
  }

  // 3. Place logo and check contrast
  const logoResult = await placeLogo({
    logoBuffer,
    template,
    charter,
    alignment: logoAlignment,
  });

  const compositeLayers: sharp.OverlayOptions[] = [];

  // Add intermediate contrast background if contrast is < 3:1
  if (logoResult.needsIntermediateBg && logoResult.intermediateBgSvg) {
    compositeLayers.push({
      input: Buffer.from(logoResult.intermediateBgSvg),
      top: 0,
      left: 0,
    });
  }

  // Add resized logo
  compositeLayers.push({
    input: logoResult.resizedLogoBuffer,
    top: logoResult.geometry.y,
    left: logoResult.geometry.x,
  });

  // 4. Render typography (omit text for avatar to keep icon clean, unless very short)
  if (!isAvatar) {
    let textW = targetW;
    let textH = Math.round(targetH * 0.35);
    let textX = 0;
    let textY = logoResult.geometry.y + logoResult.geometry.height + 24;

    if (isBanner) {
      textW = Math.round(targetW * 0.55);
      textH = targetH - template.margins.top - template.margins.bottom;
      textX = Math.round(targetW * 0.4);
      textY = template.margins.top;
    } else if (isVertical) {
      textY = Math.round(targetH * 0.55);
      textH = Math.round(targetH * 0.35);
    }

    // Ensure within bounds
    if (textY + textH > targetH) {
      textH = Math.max(50, targetH - textY - template.margins.bottom);
    }

    const textSvg = await renderBrandTextToSvg({
      brandName,
      tagline,
      width: textW,
      height: textH,
      charter,
      alignment: isBanner ? "left" : "center",
    });

    compositeLayers.push({
      input: Buffer.from(textSvg),
      top: textY,
      left: textX,
    });
  }

  // 5. Final composite to PNG
  const outputBuffer = await baseCanvas
    .composite(compositeLayers)
    .png({ quality: 90, compressionLevel: 8 })
    .toBuffer();

  // Verify dimensions
  const finalMeta = await sharp(outputBuffer).metadata();
  if (finalMeta.width !== targetW || finalMeta.height !== targetH) {
    throw new Error(
      `Composed asset dimensions (${finalMeta.width}x${finalMeta.height}) do not match target (${targetW}x${targetH})`,
    );
  }

  return {
    outputBuffer,
    width: targetW,
    height: targetH,
    supportId: template.id,
  };
}
