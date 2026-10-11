/**
 * jobs/plan-assets.ts — Inngest job: plan-assets
 *
 * Flow:
 *  1. Load the project's Charter and chosen supports from DB
 *  2. Plan assets using planAssets() (idempotency keys + spend cap check)
 *  3. Trigger the state machine transition PLAN_READY (STRATEGY_READY -> GENERATING)
 *  4. Dispatch event "brand-studio/generate-assets"
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 18.2, 18.3
 */

import { inngest } from "@/inngest";
import { getCharter } from "@/lib/db/queries/charters";
import { getConversationByProjectId } from "@/lib/db/queries/conversations";
import { log } from "@/lib/logger";
import { DEFAULT_SUPPORTS, planAssets } from "@/lib/planning/assets";
import { stateMachine } from "@/lib/state/machine";

interface PlanAssetsEventData {
  projectId: string;
}

export const planAssetsJob = inngest.createFunction(
  {
    id: "plan-assets",
    name: "Plan Assets",
    triggers: [{ event: "brand-studio/plan-assets" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as PlanAssetsEventData;

    try {
      // Step 1: Load inputs
      const { charter, supports } = await step.run(
        "load-inputs",
        async () => {
          log.info("Loading charter and conversation for asset planning", {
            projectId,
          });

          const ch = await getCharter(projectId);
          if (!ch) {
            throw new Error(`Charter not found for project ${projectId}`);
          }

          const conversation = await getConversationByProjectId(projectId);
          const collected = (conversation?.collected_data ?? {}) as Record<
            string,
            unknown
          >;

          const chosenSupports = Array.isArray(collected.supports)
            ? (collected.supports as string[])
            : [...DEFAULT_SUPPORTS];

          return { charter: ch, supports: chosenSupports };
        },
      );

      // Step 2: Create plan and persist pending assets
      const plan = await step.run("create-plan", async () => {
        log.info("Planning assets and verifying spend cap", { projectId });
        return await planAssets(projectId, charter, supports);
      });

      // Step 3: Trigger state machine transition PLAN_READY (moves project to GENERATING)
      await step.run("transition-plan-ready", async () => {
        log.info("Triggering PLAN_READY transition", { projectId });
        await stateMachine.apply(projectId, "PLAN_READY", "plan-assets");
      });

      // Step 4: Dispatch generate-assets event
      await step.sendEvent("trigger-generate-assets", {
        name: "brand-studio/generate-assets",
        data: { projectId },
      });

      log.info(
        `plan-assets job completed successfully: ${plan.assets.length} assets planned, total cost ${plan.totalEstimatedCostRodi} RODI`,
        {
          projectId,
          step: "plan-assets",
        },
      );

      return {
        projectId,
        totalAssets: plan.assets.length,
        totalCost: plan.totalEstimatedCostRodi,
        status: "done",
      };
    } catch (err) {
      log.error("plan-assets job failed", {
        projectId,
        error: {
          code: "PLANNING_JOB_ERROR",
          operation: "plan-assets",
        },
      });
      throw err;
    }
  },
);
