/**
 * jobs/analyze-logo.ts — Inngest job: analyze-logo
 *
 * Downloads the logo from Supabase Storage, runs deterministic and semantic
 * analysis, merges the results into a full BrandProfile, validates it, persists
 * it in the `brand_profiles` table, and triggers the ANALYSIS_DONE transition.
 *
 * On any unrecoverable failure the ANALYSIS_FAILED transition is triggered and
 * the error is re-thrown so that Inngest can handle retry / dead-letter logic.
 *
 * Requirements: 8.4, 9.1, 18.3
 */

import { inngest } from "@/inngest";
import { analyzeLogo } from "@/lib/analysis/deterministic";
import { analyzeLogoSemantic } from "@/lib/analysis/semantic";
import { brandProfileSchema } from "@/lib/analysis/types";
import { db } from "@/lib/db/client";
import { downloadFile } from "@/lib/files/storage";
import { log } from "@/lib/logger";
import { stateMachine } from "@/lib/state/machine";

// ---------------------------------------------------------------------------
// Event payload type
// ---------------------------------------------------------------------------

interface AnalyzeLogoEventData {
  projectId: string;
  storagePath: string;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const analyzeLogoJob = inngest.createFunction(
  {
    id: "analyze-logo",
    name: "Analyze Logo",
    triggers: [{ event: "brand-studio/analyze-logo" }],
  },
  async ({ event, step }) => {
    const { projectId, storagePath } = event.data as AnalyzeLogoEventData;

    try {
      // ------------------------------------------------------------------
      // Step 1 — Download logo buffer from Supabase Storage
      // ------------------------------------------------------------------
      const buffer = await step.run("download-logo", async () => {
        log.info("Downloading logo from storage", { projectId });
        const buf = await downloadFile(storagePath);
        // Buffer is not serialisable across step boundaries as-is; convert to
        // a plain array so Inngest can serialise / deserialise it correctly.
        return Array.from(buf);
      });

      // ------------------------------------------------------------------
      // Step 2 — Deterministic analysis
      // ------------------------------------------------------------------
      const deterministicResult = await step.run(
        "deterministic-analysis",
        async () => {
          log.info("Running deterministic analysis", { projectId });
          const buf = Buffer.from(buffer);
          return analyzeLogo(buf);
        },
      );

      // ------------------------------------------------------------------
      // Step 3 — Semantic analysis (vision AI)
      // ------------------------------------------------------------------
      const semanticResult = await step.run(
        "semantic-analysis",
        async () => {
          log.info("Running semantic analysis", { projectId });
          const buf = Buffer.from(buffer);
          return analyzeLogoSemantic(buf, projectId);
        },
      );

      // ------------------------------------------------------------------
      // Step 4 — Merge results into a full BrandProfile
      // ------------------------------------------------------------------
      const mergedProfile = {
        ...deterministicResult,
        ...semanticResult,
      };

      // ------------------------------------------------------------------
      // Step 5 — Validate the merged profile with brandProfileSchema
      // ------------------------------------------------------------------
      await step.run("validate-brand-profile", async () => {
        log.info("Validating brand profile", { projectId });
        const result = brandProfileSchema.safeParse(mergedProfile);
        if (!result.success) {
          throw new Error(
            `BrandProfile validation failed for project ${projectId}: ${result.error.message}`,
          );
        }
        return result.data;
      });

      // ------------------------------------------------------------------
      // Step 6 — Persist the profile in brand_profiles (upsert on project_id)
      // ------------------------------------------------------------------
      await step.run("persist-brand-profile", async () => {
        log.info("Persisting brand profile", { projectId });

        const { error } = await db.from("brand_profiles").upsert(
          {
            project_id: projectId,
            profile_data: mergedProfile,
            created_at: new Date().toISOString(),
          },
          { onConflict: "project_id" },
        );

        if (error) {
          throw new Error(
            `Failed to persist brand profile for project ${projectId}: ${error.message}`,
          );
        }
      });

      // ------------------------------------------------------------------
      // Step 7 — Trigger ANALYSIS_DONE state transition
      // ------------------------------------------------------------------
      await step.run("transition-analysis-done", async () => {
        log.info("Triggering ANALYSIS_DONE transition", { projectId });
        await stateMachine.apply(projectId, "ANALYSIS_DONE", "analyze-logo");
      });

      await step.sendEvent("trigger-brand-strategy", {
        name: "brand-studio/brand-strategy",
        data: { projectId },
      });

      log.info("analyze-logo job completed successfully", { projectId });

      return { projectId, status: "done" };
    } catch (err) {
      // ------------------------------------------------------------------
      // On failure: trigger ANALYSIS_FAILED and re-throw for Inngest retries
      // ------------------------------------------------------------------
      log.error("analyze-logo job failed, triggering ANALYSIS_FAILED", {
        projectId,
        error: {
          code: "ANALYSIS_JOB_ERROR",
          operation: "analyze-logo",
        },
      });

      try {
        await stateMachine.apply(projectId, "ANALYSIS_FAILED", "analyze-logo");
      } catch (transitionErr) {
        // Log but don't mask the original error
        log.error("Failed to apply ANALYSIS_FAILED transition", {
          projectId,
          error: {
            code: "TRANSITION_ERROR",
            operation: "ANALYSIS_FAILED",
          },
        });
      }

      throw err;
    }
  },
);
