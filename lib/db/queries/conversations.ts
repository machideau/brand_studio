import { db } from "@/lib/db/client";
import type { Conversation } from "@/lib/db/types";

/**
 * Fetch the conversation record for a given user.
 * Returns null if no record exists yet.
 */
export async function getConversation(userId: string): Promise<Conversation | null> {
  const { data, error } = await db
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[db/conversations] getConversation failed: ${error.message}`,
    );
  }

  return data as Conversation | null;
}

/**
 * Fetch the conversation record for a given active project ID.
 * Returns null if no record exists.
 */
export async function getConversationByProjectId(
  projectId: string,
): Promise<Conversation | null> {
  const { data, error } = await db
    .from("conversations")
    .select("*")
    .eq("active_project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[db/conversations] getConversationByProjectId failed: ${error.message}`,
    );
  }

  return data as Conversation | null;
}

/**
 * Insert or update the conversation record for a user.
 * Uses upsert on the user_id column (assumed unique in the table).
 * `data` is a partial Conversation — only the fields to write.
 */
export async function upsertConversation(
  userId: string,
  data: Partial<Omit<Conversation, "id" | "user_id">>,
): Promise<Conversation> {
  const payload = {
    ...data,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  const { data: result, error } = await db
    .from("conversations")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `[db/conversations] upsertConversation failed: ${error.message}`,
    );
  }

  return result as Conversation;
}
