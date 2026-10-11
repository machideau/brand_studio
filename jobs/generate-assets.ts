/**
 * jobs/generate-assets.ts — Inngest job: generate-assets
 *
 * Runs 1 Inngest step per support to generate AI backgrounds/textures:
 *  - Enforces idempotency: skips assets already generated
 *  - Prompts RodiumAI only for abstract backgrounds/textures (never text, never logo)
 *  - Saves background images in Supabase Storage
 *  - Records costs
 *  - Triggers GENERATION_DONE transition (GENERATING -> COMPOSING)
 *  - Dispatches "brand-studio/compose" event
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 19.5
 */

import { inngest } from "@/inngest";
import { createRodiumAIImageProvider } from "@/lib/ai/image-provider";
import { getSupportTemplate } from "@/lib/config/supports";
import { IMAGE_MODELS } from "@/lib/config/models";
import { getProjectAssets, updateAssetStatus } from "@/lib/db/queries/assets";
import { getCharter } from "@/lib/db/queries/charters";
import { uploadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";
import { stateMachine } from "@/lib/state/machine";

interface GenerateAssetsEventData {
  projectId: string;
}

export const generateAssetsJob = inngest.createFunction(
  {
    id: "generate-assets",
    name: "Generate Assets",
    triggers: [{ event: "brand-studio/generate-assets" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as GenerateAssetsEventData;

    try {
      // Step 1: Load charter and planned assets
      const { charter, assets } = await step.run("load-plan", async () => {
        log.info("Loading charter and planned assets for generation", {
          projectId,
          step: "generate-assets",
        });

        const ch = await getCharter(projectId);
        if (!ch) {
          throw new Error(`Charter not found for project ${projectId}`);
        }

        const plannedAssets = await getProjectAssets(projectId);
        if (plannedAssets.length === 0) {
          throw new Error(`No planned assets found for project ${projectId}`);
        }

        return { charter: ch, assets: plannedAssets };
      });

      const imageProvider = createRodiumAIImageProvider();

      // Step 2: Generate 1 background per support
      for (const asset of assets) {
        await step.run(`generate-bg-${asset.support_type}`, async () => {
          if (asset.status === "done" && asset.storage_path) {
            log.info(`Skipping already produced asset ${asset.support_type}`, {
              projectId,
              step: "generate-assets",
            });
            return { skipped: true, supportType: asset.support_type };
          }

          log.info(`Generating background for ${asset.support_type}`, {
            projectId,
            step: "generate-assets",
          });

          await updateAssetStatus(asset.id, "generating");

          const template = getSupportTemplate(asset.support_type);
          const styles = charter.visualStyle.join(", ");
          const prompt = `Abstract minimalist background scene for branding identity, visual style: ${styles}, primary tone: ${charter.colors.primary}, secondary tone: ${charter.colors.secondary}, clean background texture, atmospheric lighting, NO text, NO letters, NO words, NO logos.`;

          const result = await imageProvider.generate({
            prompt,
            width: Math.min(1024, template.widthPx),
            height: Math.min(1024, template.heightPx),
            model: IMAGE_MODELS.default.modelId,
            idempotencyKey: asset.idempotency_key,
          });

          const rawBase64 = result.imageBase64.replace(/^data:image\/\w+;base64,/, "");
          const bgBuffer = Buffer.from(rawBase64, "base64");

          const storagePath = `projects/${projectId}/backgrounds/${asset.support_type}.png`;
          await uploadFile(storagePath, bgBuffer, "image/png");

          return {
            supportType: asset.support_type,
            storagePath,
            fromCache: result.fromCache,
          };
        });
      }

      // Step 3: Transition state machine to COMPOSING
      await step.run("transition-generation-done", async () => {
        log.info("Triggering GENERATION_DONE transition", {
          projectId,
          step: "generate-assets",
        });
        await stateMachine.apply(projectId, "GENERATION_DONE", "generate-assets");
      });

      // Step 4: Dispatch compose event
      await step.sendEvent("trigger-compose", {
        name: "brand-studio/compose",
        data: { projectId },
      });

      log.info("generate-assets completed successfully", {
        projectId,
        step: "generate-assets",
      });

      return { projectId, status: "done" };
    } catch (err) {
      log.error("generate-assets job failed", {
        projectId,
        step: "generate-assets",
        error: {
          code: "GENERATION_JOB_ERROR",
          operation: "generate-assets",
        },
      });
      throw err;
    }
  },
);
