import { describe, expect, it } from "vitest";
import { generateBrandbookPdf, MANDATORY_SECTIONS } from "./pdf-generator";
import type { Charter } from "@/lib/strategy/types";

describe("Brandbook PDF Generator", () => {
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
    visualStyle: ["minimaliste", "moderne"],
    logoRules: {
      safeZone: 4,
      minSize: 32,
      allowedBackgrounds: ["#ffffff", "#f8f9fa"],
      forbiddenBackgrounds: ["#ff0000"],
    },
    forbidden: ["Ne pas déformer le logo"],
    version: 1,
  };

  it("verifies that exactly 14 mandatory sections are declared", () => {
    expect(MANDATORY_SECTIONS).toHaveLength(14);
    expect(MANDATORY_SECTIONS).toContain("Couverture & Titre");
    expect(MANDATORY_SECTIONS).toContain("Présentation de la marque");
    expect(MANDATORY_SECTIONS).toContain("Palette de couleurs");
    expect(MANDATORY_SECTIONS).toContain("Guide d'impression");
    expect(MANDATORY_SECTIONS).toContain("Annexes & Mentions légales");
  });

  it("generates a valid PDF buffer with PDF header magic bytes", async () => {
    const pdfBuffer = await generateBrandbookPdf({
      projectId: "test-proj-123",
      brandName: "Acme Brand",
      tagline: "Innovative Design",
      charter: dummyCharter,
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(100);

    // Standard PDF header signature: %PDF (0x25, 0x50, 0x44, 0x46)
    const header = pdfBuffer.slice(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  });
});
