import { db } from "@/lib/db/client";
import type { Project } from "@/lib/db/types";

/**
 * Fetch a project by its UUID.
 * Returns null if no project is found.
 */
export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`[db/projects] getProject failed: ${error.message}`);
  }

  return data as Project | null;
}

/**
 * Create a new project for the given user.
 * Initial state is always "RECEIVED".
 */
export async function createProject(userId: string): Promise<Project> {
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: userId,
      state: "RECEIVED",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`[db/projects] createProject failed: ${error.message}`);
  }

  return data as Project;
}

/**
 * Update the state of a project.
 * Also bumps updated_at to the current timestamp.
 */
export async function updateProjectState(
  id: string,
  state: string,
): Promise<Project> {
  const { data, error } = await db
    .from("projects")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `[db/projects] updateProjectState failed: ${error.message}`,
    );
  }

  return data as Project;
}
