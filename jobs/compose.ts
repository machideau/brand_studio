/**
 * jobs/compose.ts — Inngest job: compose
 *
 * Runs 1 Inngest step per support to composite backgrounds, logos, and typography:
 *  - Loads original logo from Supabase Storage
 *  - Loads AI background per support
 *  - Invokes composeAsset() (Sharp + Satori)
 *  - Enforces exact target dimensions and logo aspect-ratio invariant
 *  - Uploads final PNG to Supabase Storage at projects/{projectId}/assets/{supportType}.png
 *  - Updates project_assets status to "done"
 *  - Triggers COMPOSITION_DONE transition (COMPOSING -> QA_RUNNING)
 *  - Dispatches "brand-studio/quality-control" event
 *
 * Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 19.5
 */

import { inngest } from "@/inngest";
import { composeAsset } from "@/lib/compose/compositor";
import { generateMockup, MOCKUP_CATEGORIES } from "@/lib/compose/mockups";
import { getSupportTemplate } from "@/lib/config/supports";
import { getProjectAssets, updateAssetStatus } from "@/lib/db/queries/assets";
import { getCharter } from "@/lib/db/queries/charters";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { db } from "@/lib/db/client";
import { downloadFile, uploadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";
import { stateMachine } from "@/lib/state/machine";

interface ComposeEventData {
  projectId: string;
}

export const composeJob = inngest.createFunction(
  {
    id: "compose",
    name: "Compose Assets",
    triggers: [{ event: "brand-studio/compose" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as ComposeEventData;

    try {
      // Step 1: Load context & assets
      const { charter, assets, brandName, tagline } = await step.run(
        "load-context",
        async () => {
          log.info("Loading context for composition", {
            projectId,
            step: "compose",
          });

          const ch = await getCharter(projectId);
          if (!ch) {
            throw new Error(`Charter not found for project ${projectId}`);
          }

          const plannedAssets = await getProjectAssets(projectId);
          if (plannedAssets.length === 0) {
            throw new Error(`No assets found for project ${projectId}`);
          }

          const conversation = await getConversationByProjectId(projectId);
          const collected = (conversation?.collected_data ?? {}) as Record<
            string,
            unknown
          >;

          const name = (collected.brandName as string) || "Brand";
          const tag = (collected.positioning as string) || undefined;

          return {
            charter: ch,
            assets: plannedAssets,
            brandName: name,
            tagline: tag,
          };
        },
      );

      // Step 2: Download original logo
      const logoBufferArray = await step.run("download-logo", async () => {
        log.info("Downloading original logo for composition", {
          projectId,
          step: "compose",
        });

        // Check Storage under logo/original/{projectId}
        const { data: files } = await db.storage
          .from("brand-studio")
          .list(`logo/original/${projectId}`);

        let logoPath: string | null = null;
        if (files && files.length > 0) {
          logoPath = `logo/original/${projectId}/${files[0].name}`;
        }

        if (logoPath) {
          const buf = await downloadFile(logoPath);
          return Array.from(buf);
        }

        // Fallback: create placeholder transparent logo buffer
        const fallbackBuf = Buffer.from(
          `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="80" fill="${charter.colors.primary}" />
            <text x="100" y="115" font-size="40" font-family="sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">
              ${brandName.charAt(0)}
            </text>
          </svg>`,
        );
        return Array.from(fallbackBuf);
      });

      const logoBuffer = Buffer.from(logoBufferArray);

      // Step 3: Compose each support
      for (const asset of assets) {
        await step.run(`compose-${asset.support_type}`, async () => {
          log.info(`Composing asset for support: ${asset.support_type}`, {
            projectId,
            step: "compose",
          });

          const template = getSupportTemplate(asset.support_type);

          // Download AI background if available
          let bgBuffer: Buffer | undefined;
          try {
            const bgPath = `projects/${projectId}/backgrounds/${asset.support_type}.png`;
            bgBuffer = await downloadFile(bgPath);
          } catch {
            // Background is optional; compositor falls back to charter solid background
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

          return {
            supportType: asset.support_type,
            storagePath: finalStoragePath,
            width: composed.width,
            height: composed.height,
          };
        });
      }

      // Step 3.5: Generate mockups for all 4 categories (cartes_de_visite, enseignes, vetements, ecrans)
      for (const cat of MOCKUP_CATEGORIES) {
        await step.run(`mockup-${cat}`, async () => {
          log.info(`Generating mockup for category: ${cat}`, {
            projectId,
            step: "compose",
          });

          const mockup = await generateMockup(cat, logoBuffer, charter, brandName);
          const mockupPath = `projects/${projectId}/mockups/${cat}/${mockup.filename}`;
          await uploadFile(mockupPath, mockup.buffer, "image/png");

          return {
            category: cat,
            storagePath: mockupPath,
            filename: mockup.filename,
          };
        });
      }

      // Step 4: State transition COMPOSITION_DONE -> QA_RUNNING
      await step.run("transition-composition-done", async () => {
        log.info("Triggering COMPOSITION_DONE transition", {
          projectId,
          step: "compose",
        });
        await stateMachine.apply(projectId, "COMPOSITION_DONE", "compose");
      });

      // Step 5: Dispatch quality-control event
      await step.sendEvent("trigger-quality-control", {
        name: "brand-studio/quality-control",
        data: { projectId },
      });

      log.info("compose job completed successfully", {
        projectId,
        step: "compose",
      });

      return { projectId, status: "done" };
    } catch (err) {
      log.error("compose job failed", {
        projectId,
        step: "compose",
        error: {
          code: "COMPOSE_JOB_ERROR",
          operation: "compose",
        },
      });
      throw err;
    }
  },
);
