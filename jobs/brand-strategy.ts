/**
 * jobs/brand-strategy.ts — Inngest job: brand-strategy
 *
 * Flow:
 *  1. Load BrandProfile and Conversation data for the project
 *  2. Generate and persist the brand charter via generateCharter()
 *  3. Dispatch event "brand-studio/plan-assets"
 *
 * Requirements: 10.1, 10.4, 10.5, 11.1
 */

import { inngest } from "@/inngest";
import { getBrandProfile } from "@/lib/db/queries/brand-profiles";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { log } from "@/lib/logger";
import { generateCharter, type ProjectData } from "@/lib/strategy/charter";

interface BrandStrategyEventData {
  projectId: string;
}

export const brandStrategyJob = inngest.createFunction(
  {
    id: "brand-strategy",
    name: "Brand Strategy",
    triggers: [{ event: "brand-studio/brand-strategy" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as BrandStrategyEventData;

    try {
      // Step 1: Load inputs
      const { brandProfile, projectData } = await step.run(
        "load-inputs",
        async () => {
          log.info("Loading brand profile and conversation for charter", {
            projectId,
          });

          const profile = await getBrandProfile(projectId);
          if (!profile) {
            throw new Error(`Brand profile not found for project ${projectId}`);
          }

          const conversation = await getConversationByProjectId(projectId);
          const collected = (conversation?.collected_data ?? {}) as Record<
            string,
            unknown
          >;

          const data: ProjectData = {
            brandName: (collected.brandName as string) || "Brand",
            sector: (collected.sector as string) || "Général",
            targetAudience: (collected.targetAudience as string) || "Grand public",
            positioning: (collected.positioning as string) || "Moderne et accessible",
            artDirections: Array.isArray(collected.artDirections)
              ? (collected.artDirections as string[])
              : [],
          };

          return { brandProfile: profile, projectData: data };
        },
      );

      // Step 2: Generate charter
      const charter = await step.run("generate-charter", async () => {
        log.info("Generating brand charter", { projectId, step: "brand-strategy" });
        return await generateCharter(brandProfile, projectData, projectId);
      });

      // Step 3: Trigger plan-assets
      await step.sendEvent("trigger-plan-assets", {
        name: "brand-studio/plan-assets",
        data: { projectId },
      });

      log.info(`brand-strategy completed successfully (charter v${charter.version})`, {
        projectId,
        step: "brand-strategy",
      });

      return { projectId, charterVersion: charter.version, status: "done" };
    } catch (err) {
      log.error("brand-strategy job failed", {
        projectId,
        error: {
          code: "STRATEGY_JOB_ERROR",
          operation: "brand-strategy",
        },
      });
      throw err;
    }
  },
);
