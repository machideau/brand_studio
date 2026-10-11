import { db } from "@/lib/db/client";
import type { QualityCheck } from "@/lib/db/types";

/**
 * Persist a quality check result for an asset.
 */
export async function recordQualityCheck(
  data: Omit<QualityCheck, "id" | "created_at">,
): Promise<QualityCheck> {
  const { data: result, error } = await db
    .from("quality_checks")
    .insert({
      ...data,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `[db/quality-checks] recordQualityCheck failed: ${error.message}`,
    );
  }

  return result as QualityCheck;
}
