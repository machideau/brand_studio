import { type NextRequest, NextResponse } from "next/server";
import type { Update } from "grammy/types";
import env from "@/lib/config/env";
import { inngest } from "@/inngest";
import { log } from "@/lib/logger";

/**
 * In-memory deduplication set for update_ids.
 * Bounded to prevent unbounded growth: we keep the last 1 000 update_ids.
 * This is sufficient for the single-user use case; a cold restart clears the
 * set, but Inngest idempotency keys provide a second line of defence further
 * down the pipeline.
 */
const MAX_SEEN = 1_000;
const seenUpdateIds = new Set<number>();
const seenUpdateIdQueue: number[] = [];

function hasSeenUpdate(updateId: number): boolean {
  return seenUpdateIds.has(updateId);
}

function markUpdateSeen(updateId: number): void {
  if (seenUpdateIds.has(updateId)) return;

  // Evict oldest entry when the set is full
  if (seenUpdateIdQueue.length >= MAX_SEEN) {
    const oldest = seenUpdateIdQueue.shift()!;
    seenUpdateIds.delete(oldest);
  }

  seenUpdateIds.add(updateId);
  seenUpdateIdQueue.push(updateId);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // -- 1. Verify webhook secret (Requirement 4.1 / 4.2) ---------------------
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secretHeader || secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    log.warn("webhook.unauthorized");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -- 2. Parse body ---------------------------------------------------------
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    log.warn("webhook.parse_error");
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  // -- 3. Authorization check (Requirement 4.3) ------------------------------
  // Derive the sender's telegram_id from whichever update type was received.
  const senderId =
    update.message?.from?.id ??
    update.edited_message?.from?.id ??
    update.channel_post?.from?.id ??
    update.edited_channel_post?.from?.id ??
    update.callback_query?.from?.id ??
    null;

  if (senderId !== null && senderId !== env.TELEGRAM_ALLOWED_USER_ID) {
    // Silent ignore   never send 403 to Telegram for unauthorised users
    log.info("webhook.ignored_sender");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // -- 4. Deduplication (Requirement 4.4) -----------------------------------
  if (hasSeenUpdate(update.update_id)) {
    log.info("webhook.duplicate_update", { step: `update_id:${update.update_id}` });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  markUpdateSeen(update.update_id);

  // -- 5. Acknowledge immediately then dispatch asynchronously (Req 4.5) -----
  // We fire-and-forget the Inngest send. The NextResponse is returned right
  // after so Telegram receives its 200 well within the 2-second window.
  inngest
    .send({
      name: "brand-studio/telegram.update",
      data: { update },
    })
    .catch((err: unknown) => {
      log.error("webhook.inngest_send_failed", {
        error: err instanceof Error ? err : { code: String(err) },
      });
    });

  return NextResponse.json({ ok: true }, { status: 200 });
}
