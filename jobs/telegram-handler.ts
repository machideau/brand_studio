/**
 * jobs/telegram-handler.ts — Inngest function for Telegram updates
 *
 * Consumes "brand-studio/telegram.update" sent by the webhook,
 * instantiates grammY, registers all command handlers and the
 * conversation step processor, then calls bot.handleUpdate().
 */

import { Bot } from "grammy";
import type { Update } from "grammy/types";
import { inngest } from "@/inngest";
import env from "@/lib/config/env";
import { log } from "@/lib/logger";
import {
  handleStart,
  handleHelp,
  handleNewBrand,
  handleStatus,
  handleCancel,
  handleAdminResume,
  handleAdminCancel,
} from "@/lib/bot/commands";
import { processConversationStep } from "@/lib/bot/conversation";
import { upsertUser } from "@/lib/db/queries/users";

interface TelegramUpdateEvent {
  update: Update;
}

export const telegramHandlerJob = inngest.createFunction(
  {
    id: "telegram-handler",
    name: "Telegram Update Handler",
    triggers: [{ event: "brand-studio/telegram.update" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { update } = event.data as TelegramUpdateEvent;

    log.info("telegram-handler.received", {
      step: `update_id:${update.update_id}`,
    });

    await step.run("handle-update", async () => {
      const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
        botInfo: undefined as never,
      });

      // ── Commands ─────────────────────────────────────────────────────────
      bot.command("start",        handleStart);
      bot.command("help",         handleHelp);
      bot.command("newbrand",     handleNewBrand);
      bot.command("status",       handleStatus);
      bot.command("cancel",       handleCancel);
      bot.command("admin_resume", handleAdminResume);
      bot.command("admin_cancel", handleAdminCancel);

      // ── Non-command messages (conversation flow) ──────────────────────────
      bot.on("message", async (ctx) => {
        if (ctx.message.text?.startsWith("/")) return;

        const telegramId = ctx.from?.id;
        if (!telegramId) return;

        try {
          const user = await upsertUser(telegramId);
          await processConversationStep(ctx, user.id);
        } catch (err) {
          log.error("telegram-handler.conversation_error", {
            step: `telegram_id:${telegramId}`,
            error: err instanceof Error ? err : { code: String(err) },
          });
          await ctx.reply(
            "Une erreur est survenue. Veuillez réessayer ou envoyer /cancel.",
          );
        }
      });

      await bot.handleUpdate(update);
    });

    return { processed: update.update_id };
  },
);
