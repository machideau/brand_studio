import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  calculateContrastRatio,
  calculateLogoPlacement,
  getRelativeLuminance,
  placeLogo,
} from "./logo-placer";
import { SUPPORT_TEMPLATES } from "@/lib/config/supports";
import type { Charter } from "@/lib/strategy/types";

describe("logo-placer: WCAG Contrast & Luminance", () => {
  it("calculates correct luminance for pure white and pure black", () => {
    expect(getRelativeLuminance("#ffffff")).toBeCloseTo(1.0, 2);
    expect(getRelativeLuminance("#000000")).toBeCloseTo(0.0, 2);
  });

  it("calculates maximum 21:1 contrast ratio between black and white", () => {
    const contrast = calculateContrastRatio("#000000", "#ffffff");
    expect(contrast).toBeCloseTo(21.0, 1);
  });

  it("calculates 1:1 contrast ratio for identical colors", () => {
    const contrast = calculateContrastRatio("#123456", "#123456");
    expect(contrast).toBeCloseTo(1.0, 1);
  });
});

describe("logo-placer: Proportion Invariant & Placement", () => {
  const dummyCharter: Charter = {
    colors: {
      primary: "#112233",
      secondary: "#445566",
      accent: "#ff5500",
      background: "#ffffff",
      text: "#000000",
    },
    primaryFont: "Noto Sans",
    secondaryFont: "Noto Sans",
    typographyScale: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 20,
      xl: 32,
      xxl: 48,
    },
    spacingUnit: 8,
    visualStyle: ["minimaliste"],
    logoRules: {
      safeZone: 4,
      minSize: 32,
      allowedBackgrounds: ["#ffffff"],
      forbiddenBackgrounds: ["#000000"],
    },
    forbidden: [],
    version: 1,
  };

  async function createTestLogoBuffer(w: number, h: number): Promise<Buffer> {
    return await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  it("preserves aspect ratio within 1% invariant across all supports (Property 5)", async () => {
    const origW = 345;
    const origH = 120;
    const logoBuf = await createTestLogoBuffer(origW, origH);
    const origRatio = origW / origH;

    for (const template of Object.values(SUPPORT_TEMPLATES)) {
      const placement = await calculateLogoPlacement(logoBuf, template, dummyCharter);
      const placedRatio = placement.width / placement.height;
      const deviation = Math.abs(placedRatio / origRatio - 1);

      expect(deviation).toBeLessThanOrEqual(0.01);
    }
  });

  it("triggers intermediate background badge when contrast is under 3:1 threshold", async () => {
    const logoBuf = await createTestLogoBuffer(100, 100);
    const lowContrastCharter: Charter = {
      ...dummyCharter,
      colors: {
        ...dummyCharter.colors,
        background: "#222222", // dark bg
        primary: "#333333", // dark logo -> low contrast (< 3:1)
      },
    };

    const result = await placeLogo({
      logoBuffer: logoBuf,
      template: SUPPORT_TEMPLATES.avatar,
      charter: lowContrastCharter,
      backgroundColorHex: "#222222",
      logoDominantColorHex: "#333333",
    });

    expect(result.contrastRatio).toBeLessThan(3.0);
    expect(result.needsIntermediateBg).toBe(true);
    expect(result.intermediateBgSvg).toBeDefined();
  });
});
