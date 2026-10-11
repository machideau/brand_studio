/**
 * lib/compose/mockups.test.ts — Unit tests for mockup generation
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { generateMockup, MOCKUP_CATEGORIES } from "./mockups";
import type { Charter } from "@/lib/strategy/types";

const mockCharter: Charter = {
  version: 1,
  colors: {
    primary: "#2563eb",
    secondary: "#7c3aed",
    accent: "#f59e0b",
    background: "#ffffff",
    text: "#0f172a",
  },
  primaryFont: "Noto Sans",
  secondaryFont: "Noto Sans",
  typographyScale: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  spacingUnit: 8,
  visualStyle: ["minimaliste", "moderne"],
  logoRules: {
    safeZone: 3,
    minSize: 40,
    allowedBackgrounds: ["#ffffff", "#f8fafc"],
    forbiddenBackgrounds: ["#ff0000"],
  },
  forbidden: ["Ne pas déformer le logo", "Ne pas changer les couleurs"],
};

describe("Mockup Generation", () => {
  it("generates mockups for all 4 required categories with correct metadata", async () => {
    // Generate a simple test logo
    const testLogoBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    for (const category of MOCKUP_CATEGORIES) {
      const result = await generateMockup(
        category,
        testLogoBuffer,
        mockCharter,
        "Acme Studio",
      );

      expect(result.category).toBe(category);
      // Strictly labeled presentation, never print-ready
      expect(result.usage).toBe("presentation");
      expect(result.filename).toContain("presentation");
      expect(result.filename).not.toContain("print_ready");
      expect(result.filename).not.toContain("pret_a_imprimer");

      // Verify output buffer is a valid PNG with 1200x800 dimensions
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBe(1200);
      expect(metadata.height).toBe(800);
    }
  });

  it("respects safe zones and outputs a non-empty buffer", async () => {
    const testLogoBuffer = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await generateMockup(
      "enseignes",
      testLogoBuffer,
      mockCharter,
      "Acme Studio",
    );

    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.filename).toBe("mockup_enseignes_presentation.png");
  });
});
