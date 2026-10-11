import { db } from "@/lib/db/client";
import type { ProjectAsset } from "@/lib/db/types";

/**
 * Look up an asset by its idempotency key.
 * Returns null if no matching asset exists.
 */
export async function getAsset(idempotencyKey: string): Promise<ProjectAsset | null> {
  const { data, error } = await db
    .from("project_assets")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(`[db/assets] getAsset failed: ${error.message}`);
  }

  return data as ProjectAsset | null;
}

/**
 * Create a new project asset record.
 * Initial status should be "pending".
 */
export async function createAsset(
  data: Omit<ProjectAsset, "id" | "created_at">,
): Promise<ProjectAsset> {
  const { data: result, error } = await db
    .from("project_assets")
    .insert({
      ...data,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`[db/assets] createAsset failed: ${error.message}`);
  }

  return result as ProjectAsset;
}

/**
 * Update the status (and optionally the storage path) of an asset.
 */
export async function updateAssetStatus(
  id: string,
  status: string,
  storagePath?: string,
): Promise<ProjectAsset> {
  const update: Partial<ProjectAsset> = { status };
  if (storagePath !== undefined) {
    update.storage_path = storagePath;
  }

  const { data, error } = await db
    .from("project_assets")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`[db/assets] updateAssetStatus failed: ${error.message}`);
  }

  return data as ProjectAsset;
}

/**
 * Fetch all asset records for a given project ID.
 */
export async function getProjectAssets(
  projectId: string,
): Promise<ProjectAsset[]> {
  const { data, error } = await db
    .from("project_assets")
    .select("*")
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`[db/assets] getProjectAssets failed: ${error.message}`);
  }

  return (data ?? []) as ProjectAsset[];
}
