import { db } from "@/lib/db/client";
import type { BrandProfile } from "@/lib/analysis/types";

/**
 * Fetch the BrandProfile for a project.
 * Returns null if no brand profile exists yet.
 */
export async function getBrandProfile(
  projectId: string,
): Promise<BrandProfile | null> {
  const { data, error } = await db
    .from("brand_profiles")
    .select("profile_data")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[db/brand-profiles] getBrandProfile failed: ${error.message}`,
    );
  }

  if (!data || !data.profile_data) {
    return null;
  }

  return data.profile_data as unknown as BrandProfile;
}
