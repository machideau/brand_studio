/**
 * jobs/revision.ts — Inngest job: revision
 *
 * Implements targeted correction of failing assets:
 *  - Enforces MAX_RETRIES guardrail (Requirement 15.4)
 *  - On max retries reached: triggers MAX_RETRIES transition (moves to FAILED)
 *  - Otherwise: re-executes targeted composition for only the failing assets
 *  - Triggers REVISION_DONE transition (moves to QA_RUNNING)
 *  - Dispatches "brand-studio/quality-control" to re-verify
 *
 * Requirements: 15.3, 15.4, 15.6
 */

import { inngest } from "@/inngest";
import env from "@/lib/config/env";
import { composeAsset } from "@/lib/compose/compositor";
import { getSupportTemplate } from "@/lib/config/supports";
import { getProjectAssets, updateAssetStatus } from "@/lib/db/queries/assets";
import { getCharter } from "@/lib/db/queries/charters";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { db } from "@/lib/db/client";
import { downloadFile, uploadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";
import { stateMachine } from "@/lib/state/machine";

interface RevisionEventData {
  projectId: string;
  failingAssetIds: string[];
  retryCount?: number;
}

export const revisionJob = inngest.createFunction(
  {
    id: "revision",
    name: "Revision Manager",
    triggers: [{ event: "brand-studio/revision" }],
  },
  async ({ event, step }) => {
    const { projectId, failingAssetIds, retryCount = 1 } =
      event.data as RevisionEventData;

    try {
      // Step 1: Check maximum retries guardrail
      if (retryCount >= env.MAX_RETRIES) {
        log.error("Maximum retries reached during revision. Failing project", {
          projectId,
          step: "revision",
          error: {
            code: "MAX_RETRIES_EXCEEDED",
            operation: "revision",
            attempts: retryCount,
          },
        });

        await step.run("transition-max-retries", async () => {
          await stateMachine.apply(projectId, "MAX_RETRIES", "revision");
        });

        return {
          projectId,
          status: "failed",
          reason: "Max retries exceeded without passing QC",
        };
      }

      // Step 2: Load context
      const { charter, brandName, tagline, allAssets } = await step.run(
        "load-context",
        async () => {
          const ch = await getCharter(projectId);
          if (!ch) throw new Error(`Charter not found for project ${projectId}`);

          const conversation = await getConversationByProjectId(projectId);
          const collected = (conversation?.collected_data ?? {}) as Record<
            string,
            unknown
          >;

          const assets = await getProjectAssets(projectId);

          return {
            charter: ch,
            brandName: (collected.brandName as string) || "Brand",
            tagline: (collected.positioning as string) || undefined,
            allAssets: assets,
          };
        },
      );

      // Step 3: Targeted re-composition of failing assets ONLY
      const failingAssets = allAssets.filter((a) => failingAssetIds.includes(a.id));

      // Download original logo
      const { data: logoFiles } = await db.storage
        .from("brand-studio")
        .list(`logo/original/${projectId}`);

      let logoBuffer: Buffer;
      if (logoFiles && logoFiles.length > 0) {
        logoBuffer = await downloadFile(`logo/original/${projectId}/${logoFiles[0].name}`);
      } else {
        logoBuffer = Buffer.from(
          `<svg width="200" height="200"><circle cx="100" cy="100" r="80" fill="${charter.colors.primary}" /></svg>`,
        );
      }

      for (const asset of failingAssets) {
        await step.run(`recompose-${asset.support_type}`, async () => {
          log.info(`Targeted recomposition for failing asset: ${asset.support_type}`, {
            projectId,
            step: "revision",
          });

          const template = getSupportTemplate(asset.support_type);

          let bgBuffer: Buffer | undefined;
          try {
            bgBuffer = await downloadFile(
              `projects/${projectId}/backgrounds/${asset.support_type}.png`,
            );
          } catch {
            bgBuffer = undefined;
          }

          const composed = await composeAsset({
            template,
            charter,
            logoBuffer,
            brandName,
            tagline,
            aiBackgroundBuffer: bgBuffer,
          });

          const finalStoragePath = `projects/${projectId}/assets/${asset.support_type}.png`;
          await uploadFile(finalStoragePath, composed.outputBuffer, "image/png");
          await updateAssetStatus(asset.id, "done", finalStoragePath);

          return { supportType: asset.support_type, status: "recomposed" };
        });
      }

      // Step 4: Transition REVISION_DONE (moves to QA_RUNNING)
      await step.run("transition-revision-done", async () => {
        log.info("Targeted revision completed. Moving to QA_RUNNING", {
          projectId,
          step: "revision",
        });
        await stateMachine.apply(projectId, "REVISION_DONE", "revision");
      });

      // Step 5: Trigger QA check again
      await step.sendEvent("re-trigger-quality-control", {
        name: "brand-studio/quality-control",
        data: { projectId },
      });

      return {
        projectId,
        status: "revision_done",
        recomposedCount: failingAssets.length,
      };
    } catch (err) {
      log.error("revision job failed", {
        projectId,
        step: "revision",
        error: {
          code: "REVISION_JOB_ERROR",
          operation: "revision",
        },
      });
      throw err;
    }
  },
);
