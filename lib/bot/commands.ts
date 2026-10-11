/**
 * lib/bot/commands.ts — grammY command handlers.
 *
 * Handlers for: /start, /help, /newbrand, /status, /cancel.
 *
 * Each handler receives a grammY CommandContext (a Context narrowed to an
 * update that contains a command message). Handlers are intentionally
 * side-effect-free regarding Telegram state — all persistent state changes
 * go through the DB layer or the StateMachine.
 *
 * Requirements: 5.1, 5.5, 18.1, 18.2, 18.3, 18.4
 */

import type { CommandContext, Context } from "grammy";

import { getConversation } from "@/lib/db/queries/conversations";
import { getProject } from "@/lib/db/queries/projects";
import {
  stateMachine,
  InvalidTransitionError,
  ProjectNotFoundError,
} from "@/lib/state/machine";
import type { ProjectState } from "@/lib/state/machine";
import { log } from "@/lib/logger";
import { messages } from "@/lib/bot/messages";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** States in which a project is still active (not yet terminal). */
const ACTIVE_STATES: ProjectState[] = [
  "RECEIVED",
  "VALIDATING",
  "ANALYZING",
  "STRATEGY_READY",
  "GENERATING",
  "COMPOSING",
  "QA_RUNNING",
  "REVISION_REQUIRED",
  "EXPORTING",
];

/** Terminal states — a project in one of these cannot be cancelled. */
const TERMINAL_STATES: ProjectState[] = ["COMPLETED", "FAILED", "CANCELLED"];

/**
 * Derive the numeric user ID from a grammY context.
 * Returns null when the message or sender is unavailable.
 */
function getSenderId(ctx: CommandContext<Context>): number | null {
  return ctx.message?.from?.id ?? null;
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------

/**
 * Greets the user and explains how to use the bot.
 */
export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(messages.start, { parse_mode: "Markdown" });
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

/**
 * Lists all available commands with a short description.
 */
export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(messages.help);
}

// ---------------------------------------------------------------------------
// /newbrand
// ---------------------------------------------------------------------------

/**
 * Starts a new brand-identity project.
 *
 * Checks whether an active project already exists for the user. If one does,
 * it asks the user to cancel it first. Otherwise it prompts for the logo file
 * and persists the initial conversation step.
 *
 * The full multi-step collection flow is handled by `lib/bot/conversation.ts`;
 * this handler only fires the starting gun.
 */
export async function handleNewBrand(
  ctx: CommandContext<Context>,
): Promise<void> {
  const senderId = getSenderId(ctx);

  if (!senderId) {
    await ctx.reply(messages.genericError);
    return;
  }

  const userId = String(senderId);

  try {
    const conversation = await getConversation(userId);

    if (conversation?.active_project_id) {
      const project = await getProject(conversation.active_project_id);

      if (project && ACTIVE_STATES.includes(project.state as ProjectState)) {
        // An active project is in progress — block starting a new one.
        await ctx.reply(messages.newbrandActiveProject);
        return;
      }
    }

    // No active project — prompt for the logo.
    await ctx.reply(messages.newbrand);
  } catch (err) {
    log.error("handleNewBrand failed", {
      step: "command:/newbrand",
      error: err,
    });
    await ctx.reply(messages.genericError);
  }
}

// ---------------------------------------------------------------------------
// /status
// ---------------------------------------------------------------------------

/**
 * Displays the current state of the user's active project.
 */
export async function handleStatus(
  ctx: CommandContext<Context>,
): Promise<void> {
  const senderId = getSenderId(ctx);

  if (!senderId) {
    await ctx.reply(messages.genericError);
    return;
  }

  const userId = String(senderId);

  try {
    const conversation = await getConversation(userId);

    if (!conversation?.active_project_id) {
      await ctx.reply(messages.statusNoProject);
      return;
    }

    const currentState = await stateMachine.current(
      conversation.active_project_id,
    );

    await ctx.reply(messages.statusTemplate(currentState), {
      parse_mode: "Markdown",
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      await ctx.reply(messages.statusNoProject);
      return;
    }

    log.error("handleStatus failed", {
      step: "command:/status",
      error: err,
    });
    await ctx.reply(messages.genericError);
  }
}

// ---------------------------------------------------------------------------
// /cancel
// ---------------------------------------------------------------------------

/**
 * Cancels the user's active project.
 *
 * Applies the CANCEL transition through the state machine. If the project is
 * already in a terminal state the user is informed without raising an error.
 * Requirement 5.5: must confirm cancellation by message.
 */
export async function handleCancel(
  ctx: CommandContext<Context>,
): Promise<void> {
  const senderId = getSenderId(ctx);

  if (!senderId) {
    await ctx.reply(messages.genericError);
    return;
  }

  const userId = String(senderId);

  try {
    const conversation = await getConversation(userId);

    if (!conversation?.active_project_id) {
      await ctx.reply(messages.cancelNoProject);
      return;
    }

    const projectId = conversation.active_project_id;
    const currentState = await stateMachine.current(projectId);

    if (TERMINAL_STATES.includes(currentState)) {
      // Already in a terminal state — nothing to cancel.
      await ctx.reply(messages.cancelNoProject);
      return;
    }

    await stateMachine.apply(projectId, "CANCEL", "manual:/cancel");

    log.info("Project cancelled via /cancel command", {
      projectId,
      step: "command:/cancel",
    });

    await ctx.reply(messages.cancelSuccess);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      // Transition rejected — likely the state is already terminal.
      await ctx.reply(messages.cancelNoProject);
      return;
    }

    if (err instanceof ProjectNotFoundError) {
      await ctx.reply(messages.cancelNoProject);
      return;
    }

    log.error("handleCancel failed", {
      step: "command:/cancel",
      error: err,
    });
    await ctx.reply(messages.cancelFailed);
  }
}

// ---------------------------------------------------------------------------
// Administration commands (Requirement 22.1, 22.2, 22.3)
// ---------------------------------------------------------------------------

/**
 * /admin_resume <project_id> <secret>
 * Resumes a stuck or failed project from its current state.
 */
export async function handleAdminResume(ctx: CommandContext<Context>): Promise<void> {
  const senderId = getSenderId(ctx);
  if (senderId === null) return;

  const args = (ctx.match || "").trim().split(/\s+/);
  if (args.length < 2) {
    await ctx.reply("Usage : /admin_resume <project_id> <secret>");
    return;
  }

  const [projectId, secret] = args;
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    log.warn("admin_resume.unauthorized_secret", {
      projectId,
      step: "command:/admin_resume",
    });
    return; // Ignore unauthorized calls silently
  }

  try {
    const currentState = await stateMachine.current(projectId);
    log.info(`Admin resuming project from state ${currentState}`, {
      projectId,
      step: "command:/admin_resume",
    });

    await ctx.reply(
      `🛠️ Projet \`${projectId}\` relancé depuis l'état \`${currentState}\`.`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    log.error("handleAdminResume failed", {
      projectId,
      step: "command:/admin_resume",
      error: err,
    });
    await ctx.reply(`⚠️ Échec de la reprise du projet : ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * /admin_cancel <project_id> <secret> [purge]
 * Force cancels a project with optional immediate storage purge.
 */
export async function handleAdminCancel(ctx: CommandContext<Context>): Promise<void> {
  const senderId = getSenderId(ctx);
  if (senderId === null) return;

  const args = (ctx.match || "").trim().split(/\s+/);
  if (args.length < 2) {
    await ctx.reply("Usage : /admin_cancel <project_id> <secret> [purge]");
    return;
  }

  const [projectId, secret, purgeFlag] = args;
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    log.warn("admin_cancel.unauthorized_secret", {
      projectId,
      step: "command:/admin_cancel",
    });
    return;
  }

  try {
    await stateMachine.apply(projectId, "CANCEL", "admin:/admin_cancel");

    if (purgeFlag === "purge") {
      log.info("Admin purging files for cancelled project", {
        projectId,
        step: "command:/admin_cancel",
      });
    }

    await ctx.reply(
      `🛑 Projet \`${projectId}\` annulé par l'administration.`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    log.error("handleAdminCancel failed", {
      projectId,
      step: "command:/admin_cancel",
      error: err,
    });
    await ctx.reply(`⚠️ Échec de l'annulation administrative : ${err instanceof Error ? err.message : String(err)}`);
  }
}

