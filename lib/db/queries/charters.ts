/**
 * lib/db/queries/charters.ts — Charter persistence on brand_profiles table
 *
 * The charter is stored in the `charter` jsonb column of `brand_profiles`.
 * The column is added by migration 0003_charter_column.sql.
 *
 * Exigences : 10.4, 10.5
 */

import { db } from '@/lib/db/client';
import type { Charter } from '@/lib/strategy/types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve the persisted Charter for a project, or null if none exists yet.
 *
 * Returns the raw JSON value from the `charter` column. The caller is
 * responsible for validating it with `charterSchema`.
 */
export async function getCharter(projectId: string): Promise<Charter | null> {
  const { data, error } = await db
    .from('brand_profiles')
    .select('charter')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`[db/charters] getCharter failed: ${error.message}`);
  }

  if (!data) return null;

  // `charter` may be null if the row exists but the column has not been set yet
  const raw = (data as Record<string, unknown>).charter;
  if (raw === null || raw === undefined) return null;

  return raw as Charter;
}

/**
 * Persist a validated Charter for a project.
 *
 * Uses upsert on `project_id` — creates the brand_profile row if it does not
 * exist, or updates the `charter` column if it does.
 */
export async function saveCharter(projectId: string, charter: Charter): Promise<void> {
  const { error } = await db
    .from('brand_profiles')
    .upsert(
      {
        project_id: projectId,
        charter: charter as unknown as Record<string, unknown>,
        // Keep `profile` at its current value by not overwriting it here.
        // The upsert targets `project_id`; any existing `profile` column
        // value will be preserved because we only specify `charter`.
      },
      { onConflict: 'project_id', ignoreDuplicates: false },
    );

  if (error) {
    throw new Error(`[db/charters] saveCharter failed: ${error.message}`);
  }
}
