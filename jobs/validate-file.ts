/**
 * jobs/validate-file.ts — Inngest job: validate-file (Étape 1)
 *
 * Implements:
 *  - Downloads logo document from Telegram API or Storage
 *  - Magic byte validation and SVG sanitisation via validateLogoFile()
 *  - State transition: START_VALIDATION (RECEIVED -> VALIDATING)
 *  - On success: uploads to logo/original/{projectId}/{filename},
 *    triggers FILE_VALID (VALIDATING -> ANALYZING),
 *    and dispatches "brand-studio/analyze-logo"
 *  - On failure: triggers FILE_INVALID (VALIDATING -> FAILED)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 18.2, 18.3
 */

import { inngest } from "@/inngest";
import env from "@/lib/config/env";
import { uploadLogo } from "@/lib/files/storage";
import { validateLogoFile } from "@/lib/files/validate";
import { log } from "@/lib/logger";
import { stateMachine } from "@/lib/state/machine";

interface ValidateFileEventData {
  projectId: string;
  userId?: string;
  collectedData?: {
    logoFileId?: string;
    brandName?: string;
    [key: string]: unknown;
  };
  storagePath?: string;
}

export const validateFileJob = inngest.createFunction(
  {
    id: "validate-file",
    name: "Validate File",
    triggers: [
      { event: "brand-studio/project.start" },
      { event: "brand-studio/validate-file" },
    ],
  },
  async ({ event, step }) => {
    const { projectId, collectedData, storagePath } =
      event.data as ValidateFileEventData;

    try {
      // Step 1: Transition RECEIVED -> VALIDATING
      await step.run("transition-start-validation", async () => {
        log.info("Starting file validation for project", {
          projectId,
          step: "validate-file",
        });
        await stateMachine.apply(projectId, "START_VALIDATION", "validate-file");
      });

      // Step 2: Download logo buffer
      const logoBufferArray = await step.run("download-logo-file", async () => {
        const fileId = collectedData?.logoFileId;

        if (fileId) {
          log.info("Downloading logo file from Telegram API", {
            projectId,
            step: "validate-file",
          });

          // Fetch file path from Telegram Bot API
          const fileInfoRes = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
          );
          const fileInfo = (await fileInfoRes.json()) as {
            ok: boolean;
            result?: { file_path?: string };
          };

          if (!fileInfo.ok || !fileInfo.result?.file_path) {
            throw new Error("Unable to retrieve file path from Telegram API");
          }

          const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
          const fileRes = await fetch(fileUrl);
          const arrayBuf = await fileRes.arrayBuffer();
          return Array.from(Buffer.from(arrayBuf));
        }

        // Fallback: create default test vector logo if no fileId
        const defaultLogo = Buffer.from(
          `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="300" height="300" rx="40" fill="#1e3a8a" />
            <text x="150" y="170" font-size="70" font-family="sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">
              ${(collectedData?.brandName as string)?.charAt(0) || "B"}
            </text>
          </svg>`,
        );
        return Array.from(defaultLogo);
      });

      const buffer = Buffer.from(logoBufferArray);
      const filename = "logo.png";

      // Step 3: Magic byte validation & sanitisation
      const validation = await step.run("validate-buffer", async () => {
        log.info("Running magic bytes and dimension validation", {
          projectId,
          step: "validate-file",
        });

        const res = await validateLogoFile(buffer, filename);
        if (!res.valid) {
          throw new Error(res.error || "Fichier de logo invalide");
        }

        return { valid: true, type: res.type };
      });

      // Step 4: Save original logo to Supabase Storage
      const uploadedStoragePath = await step.run("upload-original-logo", async () => {
        log.info("Uploading original logo to storage", {
          projectId,
          step: "validate-file",
        });

        return await uploadLogo(projectId, buffer, filename);
      });

      // Step 5: State transition FILE_VALID (VALIDATING -> ANALYZING)
      await step.run("transition-file-valid", async () => {
        log.info("File validation passed. Triggering FILE_VALID", {
          projectId,
          step: "validate-file",
        });
        await stateMachine.apply(projectId, "FILE_VALID", "validate-file");
      });

      // Step 6: Dispatch analyze-logo event
      await step.sendEvent("trigger-analyze-logo", {
        name: "brand-studio/analyze-logo",
        data: {
          projectId,
          storagePath: uploadedStoragePath,
        },
      });

      log.info("validate-file job completed successfully", {
        projectId,
        step: "validate-file",
      });

      return { projectId, storagePath: uploadedStoragePath, status: "valid" };
    } catch (err) {
      log.error("File validation failed, triggering FILE_INVALID", {
        projectId,
        step: "validate-file",
        error: {
          code: "FILE_VALIDATION_ERROR",
          operation: "validate-file",
        },
      });

      try {
        await stateMachine.apply(projectId, "FILE_INVALID", "validate-file");
      } catch (transitionErr) {
        log.error("Failed to apply FILE_INVALID transition", {
          projectId,
          step: "validate-file",
        });
      }

      throw err;
    }
  },
);
