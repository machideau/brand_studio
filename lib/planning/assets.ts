/**
 * lib/planning/assets.ts — Asset planning and spend-cap validation
 *
 * Flow:
 *  1. Generate an idempotency key for each target support:
 *     hash(projectId + supportType + charterVersion)
 *  2. Check DB to see if an asset with this key is already produced (status='done')
 *  3. Calculate estimated cost per asset and total estimated cost in RODI
 *  4. Check whether total cost exceeds SPEND_CAP_RODI
 *  5. Persist planned assets in project_assets table (initial status: 'pending')
 *     without re-creating existing assets
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { createHash } from "crypto";
import env from "@/lib/config/env";
import { IMAGE_MODELS } from "@/lib/config/models";
import { createAsset, getAsset } from "@/lib/db/queries/assets";
import { log } from "@/lib/logger";
import type { Charter } from "@/lib/strategy/types";

// ---------------------------------------------------------------------------
// Types & Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SUPPORTS = [
  "avatar",
  "bannière",
  "carte_de_visite",
  "publication_carrée",
  "publication_verticale",
] as const;

export interface PlannedAsset {
  supportType: string;
  idempotencyKey: string;
  model: string;
  estimatedCostRodi: number;
  alreadyDone: boolean;
}

export interface AssetPlan {
  projectId: string;
  charterVersion: number;
  assets: PlannedAsset[];
  totalEstimatedCostRodi: number;
  exceedsSpendCap: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic idempotency key for an asset:
 * SHA-256 hash of `${projectId}_${supportType}_${charterVersion}`
 */
export function generateAssetIdempotencyKey(
  projectId: string,
  supportType: string,
  charterVersion: number,
): string {
  return createHash("sha256")
    .update(`${projectId}_${supportType}_${charterVersion}`)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Plan all assets for a project and charter, check the spend cap,
 * and persist pending asset records in the database.
 *
 * Requirement 11.1, 11.2, 11.3, 11.4
 */
export async function planAssets(
  projectId: string,
  charter: Charter,
  targetSupports: string[] = [...DEFAULT_SUPPORTS],
): Promise<AssetPlan> {
  const supports = targetSupports.length > 0 ? targetSupports : [...DEFAULT_SUPPORTS];
  const modelConfig = IMAGE_MODELS.default;
  const unitCost = modelConfig.unitPriceRodi;

  const plannedAssets: PlannedAsset[] = [];

  for (const supportType of supports) {
    const idempotencyKey = generateAssetIdempotencyKey(
      projectId,
      supportType,
      charter.version,
    );

    const existing = await getAsset(idempotencyKey);
    const alreadyDone = existing?.status === "done";

    plannedAssets.push({
      supportType,
      idempotencyKey,
      model: modelConfig.modelId,
      estimatedCostRodi: unitCost,
      alreadyDone,
    });

    if (!existing) {
      log.info(`Plan asset for support: ${supportType}`, {
        projectId,
        step: "plan_assets",
      });

      await createAsset({
        project_id: projectId,
        support_type: supportType,
        idempotency_key: idempotencyKey,
        status: "pending",
        storage_path: null,
      });
    }
  }

  const totalEstimatedCostRodi = plannedAssets.reduce(
    (sum, a) => sum + a.estimatedCostRodi,
    0,
  );

  const exceedsSpendCap = totalEstimatedCostRodi > env.SPEND_CAP_RODI;

  if (exceedsSpendCap) {
    log.warn(
      `Total estimated cost ${totalEstimatedCostRodi} RODI exceeds spend cap ${env.SPEND_CAP_RODI} RODI`,
      {
        projectId,
        step: "plan_assets",
      },
    );
  }

  return {
    projectId,
    charterVersion: charter.version,
    assets: plannedAssets,
    totalEstimatedCostRodi,
    exceedsSpendCap,
  };
}
