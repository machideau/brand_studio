/**
 * jobs/quality-control.ts — Inngest job: quality-control
 *
 * Runs deterministic quality control checks across all project assets:
 *  - Checks dimensions, logo aspect ratio, brand name presence, and WCAG contrast
 *  - Persists check results into quality_checks table
 *  - On zero blocking errors: triggers QA_PASS transition (moves to EXPORTING)
 *    and dispatches "brand-studio/brandbook"
 *  - On blocking errors: triggers QA_FAIL transition (moves to REVISION_REQUIRED)
 *    and dispatches "brand-studio/revision"
 *
 * Requirements: 15.1, 15.2, 15.3, 15.5, 15.6
 */

import { inngest } from "@/inngest";
import { getSupportTemplate } from "@/lib/config/supports";
import { getProjectAssets } from "@/lib/db/queries/assets";
import { getCharter } from "@/lib/db/queries/charters";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { recordQualityCheck } from "@/lib/db/queries/quality-checks";
import { downloadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";
import { checkAssetQuality } from "@/lib/qc/checker";
import { stateMachine } from "@/lib/state/machine";

interface QualityControlEventData {
  projectId: string;
}

export const qualityControlJob = inngest.createFunction(
  {
    id: "quality-control",
    name: "Quality Control",
    triggers: [{ event: "brand-studio/quality-control" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as QualityControlEventData;

    try {
      // Step 1: Load context & assets
      const { charter, assets, brandName } = await step.run(
        "load-context",
        async () => {
          log.info("Loading context for quality control", {
            projectId,
            step: "quality-control",
          });

          const ch = await getCharter(projectId);
          if (!ch) {
            throw new Error(`Charter not found for project ${projectId}`);
          }

          const projectAssets = await getProjectAssets(projectId);
          if (projectAssets.length === 0) {
            throw new Error(`No assets found for project ${projectId}`);
          }

          const conversation = await getConversationByProjectId(projectId);
          const collected = (conversation?.collected_data ?? {}) as Record<
            string,
            unknown
          >;

          const name = (collected.brandName as string) || "Brand";

          return { charter: ch, assets: projectAssets, brandName: name };
        },
      );

      // Step 2: Check each asset
      const failingAssets: string[] = [];

      for (const asset of assets) {
        await step.run(`check-${asset.support_type}`, async () => {
          log.info(`Running QC on asset: ${asset.support_type}`, {
            projectId,
            step: "quality-control",
          });

          if (!asset.storage_path) {
            failingAssets.push(asset.id);
            await recordQualityCheck({
              project_id: projectId,
              asset_id: asset.id,
              result: {
                passed: false,
                error: "Missing storage path",
              },
            });
            return { passed: false, supportType: asset.support_type };
          }

          const assetBuffer = await downloadFile(asset.storage_path);
          const template = getSupportTemplate(asset.support_type);

          const qcResult = await checkAssetQuality({
            assetBuffer,
            template,
            charter,
            brandName,
          });

          await recordQualityCheck({
            project_id: projectId,
            asset_id: asset.id,
            result: qcResult as unknown as Record<string, unknown>,
          });

          if (qcResult.hasBlockingErrors) {
            failingAssets.push(asset.id);
          }

          return {
            passed: qcResult.passed,
            hasBlockingErrors: qcResult.hasBlockingErrors,
            warningsCount: qcResult.warningsCount,
            supportType: asset.support_type,
          };
        });
      }

      // Step 3: Branch based on blocking errors
      if (failingAssets.length > 0) {
        log.warn(`Quality control failed with ${failingAssets.length} blocking errors`, {
          projectId,
          step: "quality-control",
        });

        await step.run("transition-qa-fail", async () => {
          await stateMachine.apply(projectId, "QA_FAIL", "quality-control");
        });

        await step.sendEvent("trigger-revision", {
          name: "brand-studio/revision",
          data: { projectId, failingAssetIds: failingAssets },
        });

        return {
          projectId,
          passed: false,
          failingCount: failingAssets.length,
          status: "revision_required",
        };
      }

      // Step 4: Quality Control Passed -> transition QA_PASS (moves to EXPORTING)
      await step.run("transition-qa-pass", async () => {
        log.info("All assets passed quality control. Triggering QA_PASS", {
          projectId,
          step: "quality-control",
        });
        await stateMachine.apply(projectId, "QA_PASS", "quality-control");
      });

      // Dispatch brandbook generation event
      await step.sendEvent("trigger-brandbook", {
        name: "brand-studio/brandbook",
        data: { projectId },
      });

      return { projectId, passed: true, status: "exporting" };
    } catch (err) {
      log.error("quality-control job failed", {
        projectId,
        step: "quality-control",
        error: {
          code: "QC_JOB_ERROR",
          operation: "quality-control",
        },
      });
      throw err;
    }
  },
);
