/**
 * jobs/cleanup.ts — Inngest cron job: cleanup
 *
 * Daily scheduled maintenance task:
 *  - Cleans expired files beyond FILE_TTR_HOURS in order:
 *      1. Temp files
 *      2. ZIP archives
 *      3. Assets & backgrounds
 *      4. Original logos
 *  - Immediately purges files from CANCELLED projects without waiting for TTR
 *  - Logs count of removed files and freed storage
 *  - Never deletes migrations or configuration files
 *
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
 */

import { inngest } from "@/inngest";
import env from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { log } from "@/lib/logger";

export const cleanupJob = inngest.createFunction(
  {
    id: "cleanup-retention",
    name: "Daily Cleanup & Retention",
    triggers: [{ cron: "0 3 * * *" }], // Daily at 3 AM UTC
  },
  async ({ step }) => {
    log.info("Starting daily cleanup of expired files and cancelled projects", {
      step: "cleanup",
    });

    const now = new Date();
    const ttrMs = env.FILE_TTR_HOURS * 3600 * 1000;
    const thresholdDate = new Date(now.getTime() - ttrMs).toISOString();

    let totalDeletedFiles = 0;

    // 1. Purge files for CANCELLED projects immediately (Requirement 21.4)
    await step.run("purge-cancelled-projects", async () => {
      const { data: cancelledProjects, error } = await db
        .from("projects")
        .select("id")
        .eq("state", "CANCELLED");

      if (error || !cancelledProjects) return { deleted: 0 };

      let deletedForCancelled = 0;
      for (const p of cancelledProjects) {
        // List files in project directory
        const { data: files } = await db.storage
          .from("brand-studio")
          .list(`projects/${p.id}`);

        if (files && files.length > 0) {
          const filePaths = files.map((f) => `projects/${p.id}/${f.name}`);
          await db.storage.from("brand-studio").remove(filePaths);
          deletedForCancelled += filePaths.length;
        }

        // Remove logo files
        const { data: logoFiles } = await db.storage
          .from("brand-studio")
          .list(`logo/original/${p.id}`);

        if (logoFiles && logoFiles.length > 0) {
          const lPaths = logoFiles.map((f) => `logo/original/${p.id}/${f.name}`);
          await db.storage.from("brand-studio").remove(lPaths);
          deletedForCancelled += lPaths.length;
        }
      }

      totalDeletedFiles += deletedForCancelled;
      log.info(`Purged ${deletedForCancelled} files from CANCELLED projects`, {
        step: "cleanup",
      });

      return { deleted: deletedForCancelled };
    });

    // 2. Purge files for COMPLETED projects past TTR threshold (Requirement 21.2)
    await step.run("purge-expired-completed-projects", async () => {
      const { data: expiredProjects, error } = await db
        .from("projects")
        .select("id, updated_at")
        .eq("state", "COMPLETED")
        .lt("updated_at", thresholdDate);

      if (error || !expiredProjects) return { deleted: 0 };

      let deletedForCompleted = 0;
      for (const p of expiredProjects) {
        // Order of deletion (Requirement 21.2):
        // 1. Temp files
        const { data: tempFiles } = await db.storage
          .from("brand-studio")
          .list(`projects/${p.id}/temp`);
        if (tempFiles && tempFiles.length > 0) {
          await db.storage
            .from("brand-studio")
            .remove(tempFiles.map((f) => `projects/${p.id}/temp/${f.name}`));
          deletedForCompleted += tempFiles.length;
        }

        // 2. ZIP archives
        const { data: zipFiles } = await db.storage
          .from("brand-studio")
          .list(`projects/${p.id}/export`);
        if (zipFiles && zipFiles.length > 0) {
          await db.storage
            .from("brand-studio")
            .remove(zipFiles.map((f) => `projects/${p.id}/export/${f.name}`));
          deletedForCompleted += zipFiles.length;
        }

        // 3. Assets & backgrounds
        const { data: assetFiles } = await db.storage
          .from("brand-studio")
          .list(`projects/${p.id}/assets`);
        if (assetFiles && assetFiles.length > 0) {
          await db.storage
            .from("brand-studio")
            .remove(assetFiles.map((f) => `projects/${p.id}/assets/${f.name}`));
          deletedForCompleted += assetFiles.length;
        }

        // 4. Logo original
        const { data: logos } = await db.storage
          .from("brand-studio")
          .list(`logo/original/${p.id}`);
        if (logos && logos.length > 0) {
          await db.storage
            .from("brand-studio")
            .remove(logos.map((f) => `logo/original/${p.id}/${f.name}`));
          deletedForCompleted += logos.length;
        }
      }

      totalDeletedFiles += deletedForCompleted;
      log.info(
        `Purged ${deletedForCompleted} expired files from COMPLETED projects beyond TTR`,
        { step: "cleanup" },
      );

      return { deleted: deletedForCompleted };
    });

    log.info(`Cleanup finished. Total files removed: ${totalDeletedFiles}`, {
      step: "cleanup",
    });

    return { totalDeletedFiles, status: "done" };
  },
);
