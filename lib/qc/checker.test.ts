import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { checkAssetQuality } from "./checker";
import { SUPPORT_TEMPLATES } from "@/lib/config/supports";
import type { Charter } from "@/lib/strategy/types";

describe("Quality Control (QC) Checker", () => {
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

  async function createBuffer(w: number, h: number): Promise<Buffer> {
    return await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  it("passes valid assets with exact dimensions", async () => {
    const template = SUPPORT_TEMPLATES.avatar; // 500x500
    const buf = await createBuffer(template.widthPx, template.heightPx);

    const result = await checkAssetQuality({
      assetBuffer: buf,
      template,
      charter: dummyCharter,
      brandName: "Acme Brand",
    });

    expect(result.passed).toBe(true);
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.issues.filter((i) => i.severity === "blocking")).toHaveLength(0);
  });

  it("detects incorrect dimensions as a blocking error", async () => {
    const template = SUPPORT_TEMPLATES.avatar; // 500x500
    const buf = await createBuffer(400, 400); // WRONG dimensions

    const result = await checkAssetQuality({
      assetBuffer: buf,
      template,
      charter: dummyCharter,
      brandName: "Acme Brand",
    });

    expect(result.passed).toBe(false);
    expect(result.hasBlockingErrors).toBe(true);
    const dimIssue = result.issues.find((i) => i.code === "INVALID_DIMENSIONS");
    expect(dimIssue).toBeDefined();
    expect(dimIssue?.severity).toBe("blocking");
  });

  it("flags empty or missing brand name as a blocking error", async () => {
    const template = SUPPORT_TEMPLATES.avatar;
    const buf = await createBuffer(template.widthPx, template.heightPx);

    const result = await checkAssetQuality({
      assetBuffer: buf,
      template,
      charter: dummyCharter,
      brandName: "   ", // whitespace only
    });

    expect(result.hasBlockingErrors).toBe(true);
    const nameIssue = result.issues.find((i) => i.code === "MISSING_BRAND_NAME");
    expect(nameIssue).toBeDefined();
    expect(nameIssue?.severity).toBe("blocking");
  });

  it("flags low contrast as a warning (non-blocking)", async () => {
    const template = SUPPORT_TEMPLATES.avatar;
    const buf = await createBuffer(template.widthPx, template.heightPx);

    const lowContrastCharter: Charter = {
      ...dummyCharter,
      colors: {
        ...dummyCharter.colors,
        background: "#eeeeee",
        primary: "#ffffff", // white on light grey -> < 3:1 contrast
      },
    };

    const result = await checkAssetQuality({
      assetBuffer: buf,
      template,
      charter: lowContrastCharter,
      brandName: "Acme",
    });

    expect(result.passed).toBe(true); // Warnings do not block pass
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.warningsCount).toBeGreaterThan(0);
    const contrastIssue = result.issues.find((i) => i.code === "LOW_CONTRAST");
    expect(contrastIssue).toBeDefined();
    expect(contrastIssue?.severity).toBe("warning");
  });
});
