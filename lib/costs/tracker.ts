/**
 * lib/costs/tracker.ts — Cost tracking, budget checks & spend cap guardrails
 *
 * Implements:
 *  - Record cost entry per AI operation
 *  - Accumulate total costs per project
 *  - Verify spend cap before expensive operations
 *  - Strict idempotency
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

import env from "@/lib/config/env";
import { getTotalCostForProject, recordCost } from "@/lib/db/queries/costs";
import { log } from "@/lib/logger";

export interface TrackCostOptions {
  projectId: string;
  provider: string;
  model: string;
  operation: string;
  declaredCost?: number | null;
  estimatedCost: number;
  attempts?: number;
}

/**
 * Record an AI operation cost and verify project spend cap.
 * Throws an Error if the project cumulative cost has exceeded env.SPEND_CAP_RODI.
 */
export async function trackCost(options: TrackCostOptions): Promise<{
  totalSpent: number;
  exceededCap: boolean;
}> {
  const {
    projectId,
    provider,
    model,
    operation,
    declaredCost = null,
    estimatedCost,
    attempts = 1,
  } = options;

  await recordCost({
    project_id: projectId,
    provider,
    model,
    operation,
    declared_cost: declaredCost,
    estimated_cost: estimatedCost,
    attempts,
  });

  const totalSpent = await getTotalCostForProject(projectId);
  const exceededCap = totalSpent > env.SPEND_CAP_RODI;

  if (exceededCap) {
    log.error("Spend cap exceeded for project", {
      projectId,
      step: "cost_tracker",
      error: {
        code: "SPEND_CAP_EXCEEDED",
        operation,
      },
    });
  }

  return { totalSpent, exceededCap };
}

/**
 * Check if a project can safely execute an operation costing `estimatedAdditionalCost`
 * without exceeding the spend cap.
 */
export async function checkBudgetAvailable(
  projectId: string,
  estimatedAdditionalCost: number,
): Promise<{ allowed: boolean; currentSpent: number; projectedTotal: number }> {
  const currentSpent = await getTotalCostForProject(projectId);
  const projectedTotal = currentSpent + estimatedAdditionalCost;
  const allowed = projectedTotal <= env.SPEND_CAP_RODI;

  return {
    allowed,
    currentSpent,
    projectedTotal,
  };
}

/**
 * Query RodiumAI wallet balance (GET /v1/wallet) before launching expensive runs.
 */
export async function checkWalletBalance(): Promise<{ balanceRodi: number } | null> {
  try {
    const res = await fetch(`${env.RODIUMAI_BASE_URL}/v1/wallet`, {
      headers: {
        Authorization: `Bearer ${env.RODIUMAI_API_KEY}`,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: number; credits?: number };
    return { balanceRodi: data.balance ?? data.credits ?? 0 };
  } catch {
    return null;
  }
}
