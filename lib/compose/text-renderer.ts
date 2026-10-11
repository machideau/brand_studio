/**
 * lib/compose/text-renderer.ts — Typography rendering with satori
 *
 * Renders brand names, taglines, and typographic elements into SVG using Satori
 * and bundled local OFL fonts (NotoSans TTF).
 *
 * Requirements: 13.4, 13.5
 */

import fs from "fs";
import path from "path";
import React from "react";
import satori from "satori";
import type { Charter } from "@/lib/strategy/types";

// ---------------------------------------------------------------------------
// Font loading & cache
// ---------------------------------------------------------------------------

let cachedRegularFont: Buffer | null = null;
let cachedBoldFont: Buffer | null = null;

function loadFonts() {
  if (!cachedRegularFont) {
    const regularPath = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(regularPath)) {
      cachedRegularFont = fs.readFileSync(regularPath);
    }
  }

  if (!cachedBoldFont) {
    const boldPath = path.join(process.cwd(), "public", "fonts", "NotoSans-Bold.ttf");
    if (fs.existsSync(boldPath)) {
      cachedBoldFont = fs.readFileSync(boldPath);
    }
  }

  return {
    regular: cachedRegularFont,
    bold: cachedBoldFont,
  };
}

// ---------------------------------------------------------------------------
// Types & API
// ---------------------------------------------------------------------------

export interface TextRenderOptions {
  brandName: string;
  tagline?: string;
  width: number;
  height: number;
  charter: Charter;
  textColor?: string;
  alignment?: "center" | "left" | "right";
}

/**
 * Render brand name and optional tagline into an SVG string using satori.
 */
export async function renderBrandTextToSvg(
  options: TextRenderOptions,
): Promise<string> {
  const {
    brandName,
    tagline,
    width,
    height,
    charter,
    textColor = charter.colors.text,
    alignment = "center",
  } = options;

  const fonts = loadFonts();
  const fontDataList: Array<{
    name: string;
    data: Buffer | ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
  }> = [];

  const fontName = charter.primaryFont || "Noto Sans";

  if (fonts.regular) {
    fontDataList.push({
      name: fontName,
      data: fonts.regular,
      weight: 400,
      style: "normal",
    });
  }

  if (fonts.bold) {
    fontDataList.push({
      name: fontName,
      data: fonts.bold,
      weight: 700,
      style: "normal",
    });
  }

  // Fallback if font files were missing
  if (fontDataList.length === 0) {
    // Generate simple SVG text directly
    const alignAttr = alignment === "center" ? "middle" : alignment === "right" ? "end" : "start";
    const xPos = alignment === "center" ? width / 2 : alignment === "right" ? width - 40 : 40;
    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${xPos}" y="${height / 2}" font-family="sans-serif" font-size="48" font-weight="bold" fill="${textColor}" text-anchor="${alignAttr}">
          ${brandName}
        </text>
        ${
          tagline
            ? `<text x="${xPos}" y="${height / 2 + 50}" font-family="sans-serif" font-size="24" fill="${textColor}" text-anchor="${alignAttr}">${tagline}</text>`
            : ""
        }
      </svg>
    `.trim();
  }

  const alignItems =
    alignment === "center"
      ? "center"
      : alignment === "right"
        ? "flex-end"
        : "flex-start";

  const textAlign = alignment;

  const element = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems,
        width: `${width}px`,
        height: `${height}px`,
        padding: "20px",
        boxSizing: "border-box",
      },
    },
    React.createElement(
      "span",
      {
        style: {
          fontFamily: fontName,
          fontSize: `${charter.typographyScale.xl || 42}px`,
          fontWeight: 700,
          color: textColor,
          textAlign,
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
        },
      },
      brandName,
    ),
    tagline
      ? React.createElement(
          "span",
          {
            style: {
              fontFamily: charter.secondaryFont || fontName,
              fontSize: `${charter.typographyScale.base || 18}px`,
              fontWeight: 400,
              color: textColor,
              opacity: 0.85,
              textAlign,
              marginTop: "12px",
            },
          },
          tagline,
        )
      : null,
  );

  const svg = await satori(element, {
    width,
    height,
    fonts: fontDataList,
  });

  return svg;
}
