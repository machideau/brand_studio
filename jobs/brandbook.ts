/**
 * jobs/brandbook.ts — Inngest job: brandbook
 *
 * Generates the paginated 14-section brand guideline PDF and uploads it to Supabase Storage:
 *  - Calls generateBrandbookPdf()
 *  - Uploads PDF to projects/{projectId}/brandbook/brandbook.pdf
 *  - Dispatches "brand-studio/export-zip"
 *
 * Requirements: 16.1, 16.2, 16.5, 19.5
 */

import { inngest } from "@/inngest";
import { generateBrandbookPdf } from "@/lib/brandbook/pdf-generator";
import { getBrandProfile } from "@/lib/db/queries/brand-profiles";
import { getCharter } from "@/lib/db/queries/charters";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { uploadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";

interface BrandbookEventData {
  projectId: string;
}

export const brandbookJob = inngest.createFunction(
  {
    id: "brandbook",
    name: "Generate Brandbook PDF",
    triggers: [{ event: "brand-studio/brandbook" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as BrandbookEventData;

    try {
      // Step 1: Load inputs
      const { charter, brandProfile, brandName, tagline, sector, targetAudience } =
        await step.run("load-inputs", async () => {
          log.info("Loading inputs for brandbook PDF", {
            projectId,
            step: "brandbook",
          });

          const ch = await getCharter(projectId);
          if (!ch) throw new Error(`Charter not found for project ${projectId}`);

          const profile = await getBrandProfile(projectId);
          const conversation = await getConversationByProjectId(projectId);
          const collected = (conversation?.collected_data ?? {}) as Record<
            string,
            unknown
          >;

          return {
            charter: ch,
            brandProfile: profile ?? undefined,
            brandName: (collected.brandName as string) || "Brand",
            tagline: (collected.positioning as string) || undefined,
            sector: (collected.sector as string) || undefined,
            targetAudience: (collected.targetAudience as string) || undefined,
          };
        });

      // Step 2: Render PDF
      const pdfBufferArray = await step.run("render-pdf", async () => {
        log.info("Rendering 14-section brandbook PDF", {
          projectId,
          step: "brandbook",
        });

        const buf = await generateBrandbookPdf({
          projectId,
          brandName,
          tagline,
          sector,
          targetAudience,
          charter,
          brandProfile,
        });

        return Array.from(buf);
      });

      // Step 3: Save PDF to Storage
      await step.run("upload-pdf", async () => {
        const storagePath = `projects/${projectId}/brandbook/brandbook.pdf`;
        log.info(`Saving brandbook PDF to storage: ${storagePath}`, {
          projectId,
          step: "brandbook",
        });

        await uploadFile(storagePath, Buffer.from(pdfBufferArray), "application/pdf");
      });

      // Step 4: Dispatch export-zip event
      await step.sendEvent("trigger-export-zip", {
        name: "brand-studio/export-zip",
        data: { projectId },
      });

      log.info("Brandbook generation completed successfully", {
        projectId,
        step: "brandbook",
      });

      return { projectId, status: "done" };
    } catch (err) {
      log.error("brandbook job failed", {
        projectId,
        step: "brandbook",
        error: {
          code: "BRANDBOOK_JOB_ERROR",
          operation: "brandbook",
        },
      });
      throw err;
    }
  },
);
