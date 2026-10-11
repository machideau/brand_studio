import { db } from "@/lib/db/client";
import type { CostRecord } from "@/lib/db/types";

/**
 * Persist a single cost record for an AI operation.
 */
export async function recordCost(
  data: Omit<CostRecord, "id" | "created_at">,
): Promise<CostRecord> {
  const { data: result, error } = await db
    .from("cost_records")
    .insert({
      ...data,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`[db/costs] recordCost failed: ${error.message}`);
  }

  return result as CostRecord;
}

/**
 * Sum all estimated costs recorded for a given project.
 * Returns 0 if no records exist.
 */
export async function getTotalCostForProject(projectId: string): Promise<number> {
  const { data, error } = await db
    .from("cost_records")
    .select("estimated_cost")
    .eq("project_id", projectId);

  if (error) {
    throw new Error(
      `[db/costs] getTotalCostForProject failed: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    return 0;
  }

  return (data as Pick<CostRecord, "estimated_cost">[]).reduce(
    (sum, row) => sum + row.estimated_cost,
    0,
  );
}
