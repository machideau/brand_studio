/**
 * jobs/export-zip.ts — Inngest job: export-zip
 *
 * Compiles all project deliverables into a clean, structured ZIP archive:
 *  - Includes logo/original, assets/, mockups/, brandbook/ and auto-generated README.txt
 *  - Uploads the ZIP to Supabase Storage
 *  - Dispatches "brand-studio/deliver" event
 *
 * Requirements: 17.1, 17.2, 17.4, 19.5
 */

import { inngest } from "@/inngest";
import { MOCKUP_CATEGORIES } from "@/lib/compose/mockups";
import { getProjectAssets } from "@/lib/db/queries/assets";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { db } from "@/lib/db/client";
import { buildZipArchive, type ZipItem } from "@/lib/export/zip-builder";
import { downloadFile, uploadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";

interface ExportZipEventData {
  projectId: string;
}

export const exportZipJob = inngest.createFunction(
  {
    id: "export-zip",
    name: "Export ZIP Archive",
    triggers: [{ event: "brand-studio/export-zip" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as ExportZipEventData;

    try {
      // Step 1: Collect all files to include in ZIP
      const { brandName, zipItems } = await step.run("gather-items", async () => {
        log.info("Gathering files for ZIP pack archive", {
          projectId,
          step: "export-zip",
        });

        const conversation = await getConversationByProjectId(projectId);
        const collected = (conversation?.collected_data ?? {}) as Record<
          string,
          unknown
        >;
        const name = (collected.brandName as string) || "Brand";

        const items: Array<{
          zipPath: string;
          bufferArray: number[];
          dimensions?: string;
          usage?: "print" | "digital" | "presentation" | "original";
        }> = [];

        // 1. Original Logo
        const { data: logoFiles } = await db.storage
          .from("brand-studio")
          .list(`logo/original/${projectId}`);

        if (logoFiles && logoFiles.length > 0) {
          const lPath = `logo/original/${projectId}/${logoFiles[0].name}`;
          const lBuf = await downloadFile(lPath);
          items.push({
            zipPath: `logo/original/${logoFiles[0].name}`,
            bufferArray: Array.from(lBuf),
            usage: "original",
          });
        }

        // 2. Composed Assets
        const assets = await getProjectAssets(projectId);
        for (const asset of assets) {
          if (asset.storage_path) {
            try {
              const aBuf = await downloadFile(asset.storage_path);
              items.push({
                zipPath: `assets/${asset.support_type}.png`,
                bufferArray: Array.from(aBuf),
                usage: asset.support_type === "carte_de_visite" ? "print" : "digital",
              });
            } catch (err) {
              log.warn(`Could not load asset file: ${asset.storage_path}`, {
                projectId,
                step: "export-zip",
              });
            }
          }
        }

        // 3. Brandbook PDF
        try {
          const pdfPath = `projects/${projectId}/brandbook/brandbook.pdf`;
          const pdfBuf = await downloadFile(pdfPath);
          items.push({
            zipPath: `brandbook/brandbook_${name.toLowerCase()}.pdf`,
            bufferArray: Array.from(pdfBuf),
            usage: "digital",
          });
        } catch {
          log.warn("Brandbook PDF not found when building ZIP", {
            projectId,
            step: "export-zip",
          });
        }

        // 4. Mockups (mockups/{category}/)
        for (const cat of MOCKUP_CATEGORIES) {
          try {
            const mockupDir = `projects/${projectId}/mockups/${cat}`;
            const { data: mFiles } = await db.storage
              .from("brand-studio")
              .list(mockupDir);

            if (mFiles && mFiles.length > 0) {
              for (const mf of mFiles) {
                const mPath = `${mockupDir}/${mf.name}`;
                const mBuf = await downloadFile(mPath);
                items.push({
                  zipPath: `mockups/${cat}/${mf.name}`,
                  bufferArray: Array.from(mBuf),
                  dimensions: "1200x800",
                  usage: "presentation",
                });
              }
            }
          } catch (err) {
            log.warn(`Could not load mockup for ${cat}`, {
              projectId,
              step: "export-zip",
            });
          }
        }

        return { brandName: name, zipItems: items };
      });

      // Step 2: Build ZIP archive buffer
      const zipBufferArray = await step.run("build-zip", async () => {
        log.info("Building ZIP compression archive", {
          projectId,
          step: "export-zip",
        });

        const items: ZipItem[] = zipItems.map((item) => ({
          zipPath: item.zipPath,
          buffer: Buffer.from(item.bufferArray),
          dimensions: item.dimensions,
          usage: item.usage,
        }));

        const zipBuf = await buildZipArchive({ brandName, items });
        return Array.from(zipBuf);
      });

      // Step 3: Save ZIP to Supabase Storage
      const storagePath = `projects/${projectId}/export/${brandName.toLowerCase()}_brand_pack.zip`;
      await step.run("upload-zip", async () => {
        log.info(`Saving ZIP archive to storage: ${storagePath}`, {
          projectId,
          step: "export-zip",
        });

        await uploadFile(
          storagePath,
          Buffer.from(zipBufferArray),
          "application/zip",
        );
      });

      // Step 4: Dispatch delivery event
      await step.sendEvent("trigger-deliver", {
        name: "brand-studio/deliver",
        data: { projectId, storagePath, brandName },
      });

      log.info("export-zip job completed successfully", {
        projectId,
        step: "export-zip",
      });

      return { projectId, storagePath, status: "done" };
    } catch (err) {
      log.error("export-zip job failed", {
        projectId,
        step: "export-zip",
        error: {
          code: "EXPORT_ZIP_ERROR",
          operation: "export-zip",
        },
      });
      throw err;
    }
  },
);
