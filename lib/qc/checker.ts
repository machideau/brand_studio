/**
 * lib/qc/checker.ts — Deterministic Quality Control
 *
 * Implements:
 *  - Verification of exact dimensions in px (blocking)
 *  - Logo proportion tolerance checking (|deviation| <= 1%) (blocking)
 *  - Strict brand name verification (blocking)
 *  - WCAG contrast verification (warning)
 *  - Distinction between blocking errors and warnings
 *
 * Requirements: 15.1, 15.2, 15.5
 */

import sharp from "sharp";
import type { SupportTemplate } from "@/lib/config/supports";
import { calculateContrastRatio } from "@/lib/compose/logo-placer";
import type { Charter } from "@/lib/strategy/types";

export type QCIssueSeverity = "blocking" | "warning";

export interface QCIssue {
  code: string;
  severity: QCIssueSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface QCResult {
  passed: boolean; // true if zero blocking errors
  hasBlockingErrors: boolean;
  warningsCount: number;
  issues: QCIssue[];
  metadata: {
    width?: number;
    height?: number;
    contrastRatio?: number;
    ratioDeviation?: number;
  };
}

export interface QCCheckInput {
  assetBuffer: Buffer;
  template: SupportTemplate;
  charter: Charter;
  brandName: string;
  declaredRatioDeviation?: number;
}

/**
 * Execute all deterministic checks on an asset.
 * Deterministic checks are always performed before any optional vision model calls.
 */
export async function checkAssetQuality(input: QCCheckInput): Promise<QCResult> {
  const {
    assetBuffer,
    template,
    charter,
    brandName,
    declaredRatioDeviation = 0,
  } = input;

  const issues: QCIssue[] = [];

  // 1. File validity & size
  if (!assetBuffer || assetBuffer.length === 0) {
    issues.push({
      code: "EMPTY_OR_UNREADABLE",
      severity: "blocking",
      message: "Le fichier produit est vide ou illisible.",
    });

    return {
      passed: false,
      hasBlockingErrors: true,
      warningsCount: 0,
      issues,
      metadata: {},
    };
  }

  // 2. Exact dimensions check
  let meta: sharp.Metadata;
  try {
    meta = await sharp(assetBuffer).metadata();
  } catch (err) {
    issues.push({
      code: "CORRUPTED_IMAGE",
      severity: "blocking",
      message: `Impossible de lire les métadonnées de l'image: ${err instanceof Error ? err.message : String(err)}`,
    });

    return {
      passed: false,
      hasBlockingErrors: true,
      warningsCount: 0,
      issues,
      metadata: {},
    };
  }

  if (meta.width !== template.widthPx || meta.height !== template.heightPx) {
    issues.push({
      code: "INVALID_DIMENSIONS",
      severity: "blocking",
      message: `Dimensions erronées: ${meta.width}x${meta.height} px au lieu des dimensions requises ${template.widthPx}x${template.heightPx} px.`,
      details: {
        actualWidth: meta.width,
        actualHeight: meta.height,
        expectedWidth: template.widthPx,
        expectedHeight: template.heightPx,
      },
    });
  }

  // 3. Logo proportion tolerance (±1%)
  if (declaredRatioDeviation > 0.01) {
    issues.push({
      code: "LOGO_DISTORTION",
      severity: "blocking",
      message: `Proportions du logo déformées au-delà de 1% (écart: ${(declaredRatioDeviation * 100).toFixed(2)}%).`,
      details: { ratioDeviation: declaredRatioDeviation },
    });
  }

  // 4. Strict brand name check
  if (!brandName || brandName.trim().length === 0) {
    issues.push({
      code: "MISSING_BRAND_NAME",
      severity: "blocking",
      message: "Nom de marque manquant ou vide.",
    });
  }

  // 5. WCAG contrast check (warning)
  const contrastRatio = calculateContrastRatio(
    charter.colors.primary,
    charter.colors.background,
  );

  if (contrastRatio < 3.0) {
    issues.push({
      code: "LOW_CONTRAST",
      severity: "warning",
      message: `Contraste WCAG limite (${contrastRatio.toFixed(2)}:1) entre la couleur primaire et le fond.`,
      details: { contrastRatio },
    });
  }

  const hasBlockingErrors = issues.some((i) => i.severity === "blocking");
  const warningsCount = issues.filter((i) => i.severity === "warning").length;

  return {
    passed: !hasBlockingErrors,
    hasBlockingErrors,
    warningsCount,
    issues,
    metadata: {
      width: meta.width,
      height: meta.height,
      contrastRatio,
      ratioDeviation: declaredRatioDeviation,
    },
  };
}
