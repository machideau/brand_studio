/**
 * jobs/deliver.ts — Inngest job: deliver
 *
 * Delivers the final ZIP pack to the user on Telegram:
 *  - Sends via Telegram document (< 50 MB) or signed expiring link (>= 50 MB)
 *  - Records delivery in delivery_records
 *  - Triggers EXPORT_DONE transition (moves project to COMPLETED)
 *
 * Requirements: 17.3, 18.2, 18.3, 19.5
 */

import { inngest } from "@/inngest";
import env from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { getProject } from "@/lib/db/queries/projects";
import { deliverZipPack } from "@/lib/export/delivery";
import { downloadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";
import { stateMachine } from "@/lib/state/machine";

interface DeliverEventData {
  projectId: string;
  storagePath: string;
  brandName?: string;
}

export const deliverJob = inngest.createFunction(
  {
    id: "deliver",
    name: "Deliver Brand Pack",
    triggers: [{ event: "brand-studio/deliver" }],
  },
  async ({ event, step }) => {
    const { projectId, storagePath, brandName = "Brand" } =
      event.data as DeliverEventData;

    try {
      // Step 1: Download ZIP and look up user's Telegram ID
      const { telegramUserId, zipBufferArray } = await step.run(
        "prepare-delivery",
        async () => {
          log.info("Preparing pack delivery for Telegram", {
            projectId,
            step: "deliver",
          });

          const project = await getProject(projectId);
          let telegramId = env.TELEGRAM_ALLOWED_USER_ID;

          if (project?.user_id) {
            const { data: userRow } = await db
              .from("users")
              .select("telegram_id")
              .eq("id", project.user_id)
              .maybeSingle();

            if (userRow?.telegram_id) {
              telegramId = Number(userRow.telegram_id);
            }
          }

          const buf = await downloadFile(storagePath);
          return { telegramUserId: telegramId, zipBufferArray: Array.from(buf) };
        },
      );

      // Step 2: Deliver pack via Telegram
      await step.run("send-telegram-pack", async () => {
        log.info("Sending pack to Telegram user", {
          projectId,
          step: "deliver",
        });

        const zipBuffer = Buffer.from(zipBufferArray);
        await deliverZipPack({
          projectId,
          telegramUserId,
          brandName,
          zipBuffer,
          storagePath,
        });
      });

      // Step 3: State transition EXPORT_DONE (EXPORTING -> COMPLETED)
      await step.run("transition-export-done", async () => {
        log.info("Project completed successfully. Triggering EXPORT_DONE", {
          projectId,
          step: "deliver",
        });
        await stateMachine.apply(projectId, "EXPORT_DONE", "deliver");
      });

      log.info("deliver job completed successfully. Project is COMPLETED", {
        projectId,
        step: "deliver",
      });

      return { projectId, status: "completed" };
    } catch (err) {
      log.error("deliver job failed, triggering EXPORT_FAILED", {
        projectId,
        step: "deliver",
        error: {
          code: "DELIVERY_JOB_ERROR",
          operation: "deliver",
        },
      });

      try {
        await stateMachine.apply(projectId, "EXPORT_FAILED", "deliver");
      } catch (transitionErr) {
        log.error("Failed to apply EXPORT_FAILED transition", {
          projectId,
          step: "deliver",
        });
      }

      throw err;
    }
  },
);
