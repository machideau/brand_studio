import { db } from "@/lib/db/client";
import type { User } from "@/lib/db/types";

/**
 * Fetch a user by their Telegram numeric ID.
 * Returns null if not found.
 */
export async function getUserByTelegramId(
  telegramId: number,
): Promise<User | null> {
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    throw new Error(`[db/users] getUserByTelegramId failed: ${error.message}`);
  }

  return data as User | null;
}

/**
 * Upsert a user record by telegram_id.
 * Creates the user on first contact, updates last_active_at on subsequent calls.
 */
export async function upsertUser(telegramId: number): Promise<User> {
  const { data, error } = await db
    .from("users")
    .upsert(
      {
        telegram_id: telegramId,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`[db/users] upsertUser failed: ${error.message}`);
  }

  return data as User;
}
