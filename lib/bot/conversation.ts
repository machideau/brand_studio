/**
 * lib/bot/conversation.ts — Multi-step /newbrand conversation flow
 *
 * Implements the guided conversation that collects all information needed to
 * kick off a brand-identity project.  After each interaction the current step
 * and all collected data are persisted in the `conversations` table so the
 * user can resume exactly where they left off after any interruption.
 *
 * Steps (in order):
 *   LOGO → NAME → SECTOR → AUDIENCE → POSITIONING →
 *   ART_DIRECTIONS → SUPPORTS → SUMMARY → CONFIRMATION
 *
 * Requirements: 5.2, 5.3, 5.4, 5.6, 6.1, 6.2, 6.3
 */

import type { Context } from "grammy";
import { getConversation, upsertConversation } from "@/lib/db/queries/conversations";
import { createProject } from "@/lib/db/queries/projects";
import { inngest } from "@/inngest";
import { IMAGE_MODELS } from "@/lib/config/models";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supported art directions that the user may choose from. */
export const ART_DIRECTIONS = [
  "minimaliste",
  "moderne",
  "classique",
  "géométrique",
  "organique",
  "typographique",
] as const;

export type ArtDirection = (typeof ART_DIRECTIONS)[number];

/** Supported output formats (supports). */
export const SUPPORTS = [
  "avatar",
  "bannière",
  "carte_de_visite",
  "publication_carrée",
  "publication_verticale",
] as const;

export type Support = (typeof SUPPORTS)[number];

/**
 * Cost per support in RODI (placeholder — uses the image model unit price).
 * Requirement 20.2: always presented as an estimate, never a guarantee.
 */
const COST_PER_SUPPORT_RODI: number = IMAGE_MODELS.default.unitPriceRodi;

// ---------------------------------------------------------------------------
// Conversation step
// ---------------------------------------------------------------------------

export type ConversationStep =
  | "LOGO"
  | "NAME"
  | "SECTOR"
  | "AUDIENCE"
  | "POSITIONING"
  | "ART_DIRECTIONS"
  | "SUPPORTS"
  | "SUMMARY"
  | "CONFIRMATION";

/** Ordered list of steps — used to derive the next step. */
const STEP_ORDER: ConversationStep[] = [
  "LOGO",
  "NAME",
  "SECTOR",
  "AUDIENCE",
  "POSITIONING",
  "ART_DIRECTIONS",
  "SUPPORTS",
  "SUMMARY",
  "CONFIRMATION",
];

// ---------------------------------------------------------------------------
// ConversationData
// ---------------------------------------------------------------------------

/**
 * Data collected during the /newbrand conversation.
 * Fields are progressively filled as the user completes each step.
 */
export interface ConversationData {
  /** Telegram file_id of the logo document (set during LOGO step). */
  logoFileId?: string;
  /** Brand name (set during NAME step). */
  brandName?: string;
  /** Activity sector (set during SECTOR step). */
  sector?: string;
  /** Target audience description (set during AUDIENCE step). */
  targetAudience?: string;
  /** Brand positioning statement (set during POSITIONING step). */
  positioning?: string;
  /** Selected art directions (set during ART_DIRECTIONS step). */
  artDirections?: ArtDirection[];
  /** Selected output supports (set during SUPPORTS step). */
  supports?: Support[];
}

// ---------------------------------------------------------------------------
// Text field validation (Requirement 5.3, Property 7)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  /** Present only when valid is false. */
  error?: string;
}

/**
 * Validate a text field collected during the conversation.
 *
 * Rules:
 *  - Trims the value before validation.
 *  - Rejects empty strings, whitespace-only strings.
 *  - Rejects strings shorter than 1 character after trim.
 *  - Rejects strings longer than 200 characters after trim.
 *
 * @param value  The raw user input string.
 * @returns      A ValidationResult with valid=true, or valid=false + error message.
 */
export function validateTextField(value: string): ValidationResult {
  const trimmed = value.trim();

  if (trimmed.length < 1) {
    return {
      valid: false,
      error:
        "La saisie ne peut pas être vide ou composée uniquement d'espaces. Veuillez entrer une réponse.",
    };
  }

  if (trimmed.length > 200) {
    return {
      valid: false,
      error: `La saisie est trop longue (${trimmed.length} caractères). Maximum : 200 caractères.`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Step prompts
// ---------------------------------------------------------------------------

/**
 * Returns the prompt message for a given step.
 * Called to ask the user for the next piece of information.
 */
function stepPrompt(step: ConversationStep): string {
  switch (step) {
    case "LOGO":
      return (
        "📎 *Étape 1/7 — Logo*\n\n" +
        "Envoyez votre logo en tant que *document* (PNG, JPEG ou SVG, 20 Mo maximum)."
      );

    case "NAME":
      return (
        "✏️ *Étape 2/7 — Nom de marque*\n\n" +
        "Quel est le *nom de votre marque* ? (1 à 200 caractères)"
      );

    case "SECTOR":
      return (
        "🏭 *Étape 3/7 — Secteur d'activité*\n\n" +
        "Dans quel *secteur d'activité* évolue votre marque ? (1 à 200 caractères)"
      );

    case "AUDIENCE":
      return (
        "🎯 *Étape 4/7 — Public cible*\n\n" +
        "Décrivez votre *public cible* : âge, centres d'intérêt, attentes… (1 à 200 caractères)"
      );

    case "POSITIONING":
      return (
        "💡 *Étape 5/7 — Positionnement*\n\n" +
        "Comment définiriez-vous le *positionnement* de votre marque ? (1 à 200 caractères)\n\n" +
        "_Exemple : « Premium et accessible, avec une touche d'humour » _"
      );

    case "ART_DIRECTIONS":
      return (
        "🎨 *Étape 6/7 — Directions artistiques*\n\n" +
        "Choisissez une ou plusieurs directions artistiques en envoyant leurs numéros séparés par des virgules :\n\n" +
        ART_DIRECTIONS.map((d, i) => `  ${i + 1}. ${d}`).join("\n") +
        "\n\n_Exemple : 1, 3_"
      );

    case "SUPPORTS":
      return (
        "🖼 *Étape 7/7 — Supports*\n\n" +
        "Choisissez les supports à générer en envoyant leurs numéros séparés par des virgules :\n\n" +
        SUPPORTS.map((s, i) => `  ${i + 1}. ${s.replace(/_/g, " ")}`).join(
          "\n",
        ) +
        "\n\n_Exemple : 1, 2, 3_"
      );

    case "SUMMARY":
    case "CONFIRMATION":
      // These are rendered dynamically via buildSummaryMessage().
      return "";
  }
}

// ---------------------------------------------------------------------------
// Summary & cost estimation
// ---------------------------------------------------------------------------

/**
 * Build the summary + cost estimate message shown before confirmation.
 * Requirement 5.4, 20.2 — always mark the cost as an estimate.
 */
function buildSummaryMessage(data: ConversationData): string {
  const supportsCount = data.supports?.length ?? 0;
  const estimatedCost = supportsCount * COST_PER_SUPPORT_RODI;

  const artDirList =
    data.artDirections && data.artDirections.length > 0
      ? data.artDirections.join(", ")
      : "—";

  const supportList =
    data.supports && data.supports.length > 0
      ? data.supports.map((s) => s.replace(/_/g, " ")).join(", ")
      : "—";

  return (
    "📋 *Récapitulatif de votre projet*\n\n" +
    `🏷 *Nom de marque :* ${data.brandName ?? "—"}\n` +
    `🏭 *Secteur :* ${data.sector ?? "—"}\n` +
    `🎯 *Public cible :* ${data.targetAudience ?? "—"}\n` +
    `💡 *Positionnement :* ${data.positioning ?? "—"}\n` +
    `🎨 *Directions artistiques :* ${artDirList}\n` +
    `🖼 *Supports demandés :* ${supportList}\n\n` +
    `💰 *Coût estimé :* ~${estimatedCost} RODI _(estimation indicative, non garantie)_\n\n` +
    "Tapez *oui* pour confirmer et lancer la génération, ou *non* pour annuler."
  );
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a comma-separated list of 1-based indices into a typed array.
 * Returns null if any index is out of range or if the list is empty.
 */
function parseIndexList<T>(
  input: string,
  options: readonly T[],
): T[] | null {
  const raw = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (raw.length === 0) return null;

  const result: T[] = [];
  for (const token of raw) {
    const n = parseInt(token, 10);
    if (isNaN(n) || n < 1 || n > options.length) return null;
    const value = options[n - 1];
    // Avoid duplicates
    if (!result.includes(value)) result.push(value);
  }

  return result.length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Core: processConversationStep
// ---------------------------------------------------------------------------

/**
 * Main entry point called by the Telegram webhook handler for every non-command
 * message received during a /newbrand conversation.
 *
 * Algorithm:
 *  1. Load the persisted conversation state for `userId`.
 *  2. Determine the current step (defaults to LOGO if none persisted).
 *  3. Process the incoming message according to that step.
 *  4. On success: advance to the next step, persist, reply with the next prompt.
 *  5. On validation failure: reply with the error, keep the same step.
 *  6. On CONFIRMATION: create the project record and trigger the Inngest pipeline.
 *
 * @param ctx     grammY Context from the Telegram webhook handler.
 * @param userId  String UUID of the authenticated user (derived from telegram_id).
 */
export async function processConversationStep(
  ctx: Context,
  userId: string,
): Promise<void> {
  try {
    // ── 1. Load persisted state ─────────────────────────────────────────────
    const conversation = await getConversation(userId);

    const currentStep: ConversationStep =
      (conversation?.step as ConversationStep | undefined) ?? "LOGO";

    const collectedData: ConversationData =
      (conversation?.collected_data as ConversationData | undefined) ?? {};

    // ── 2. Process the current step ─────────────────────────────────────────
    const message = ctx.message;

    if (!message) {
      log.warn("processConversationStep: no message in context", {
        step: `conversation:${currentStep}`,
      });
      return;
    }

    switch (currentStep) {
      // ── LOGO ────────────────────────────────────────────────────────────
      case "LOGO": {
        const document = message.document;

        if (!document) {
          await ctx.reply(
            "⚠️ Veuillez envoyer votre logo en tant que *document* (non compressé), pas comme photo.",
            { parse_mode: "Markdown" },
          );
          return;
        }

        collectedData.logoFileId = document.file_id;
        await advanceTo(ctx, userId, "NAME", collectedData);
        return;
      }

      // ── NAME ────────────────────────────────────────────────────────────
      case "NAME": {
        const text = message.text ?? "";
        const validation = validateTextField(text);

        if (!validation.valid) {
          await ctx.reply(`⚠️ ${validation.error}`, { parse_mode: "Markdown" });
          return;
        }

        collectedData.brandName = text.trim();
        await advanceTo(ctx, userId, "SECTOR", collectedData);
        return;
      }

      // ── SECTOR ──────────────────────────────────────────────────────────
      case "SECTOR": {
        const text = message.text ?? "";
        const validation = validateTextField(text);

        if (!validation.valid) {
          await ctx.reply(`⚠️ ${validation.error}`, { parse_mode: "Markdown" });
          return;
        }

        collectedData.sector = text.trim();
        await advanceTo(ctx, userId, "AUDIENCE", collectedData);
        return;
      }

      // ── AUDIENCE ────────────────────────────────────────────────────────
      case "AUDIENCE": {
        const text = message.text ?? "";
        const validation = validateTextField(text);

        if (!validation.valid) {
          await ctx.reply(`⚠️ ${validation.error}`, { parse_mode: "Markdown" });
          return;
        }

        collectedData.targetAudience = text.trim();
        await advanceTo(ctx, userId, "POSITIONING", collectedData);
        return;
      }

      // ── POSITIONING ─────────────────────────────────────────────────────
      case "POSITIONING": {
        const text = message.text ?? "";
        const validation = validateTextField(text);

        if (!validation.valid) {
          await ctx.reply(`⚠️ ${validation.error}`, { parse_mode: "Markdown" });
          return;
        }

        collectedData.positioning = text.trim();
        await advanceTo(ctx, userId, "ART_DIRECTIONS", collectedData);
        return;
      }

      // ── ART_DIRECTIONS ──────────────────────────────────────────────────
      case "ART_DIRECTIONS": {
        const text = message.text ?? "";
        const chosen = parseIndexList(text, ART_DIRECTIONS);

        if (!chosen) {
          await ctx.reply(
            "⚠️ Sélection invalide. Envoyez les numéros des directions artistiques séparés par des virgules.\n\n" +
              ART_DIRECTIONS.map((d, i) => `  ${i + 1}. ${d}`).join("\n"),
            { parse_mode: "Markdown" },
          );
          return;
        }

        collectedData.artDirections = chosen;
        await advanceTo(ctx, userId, "SUPPORTS", collectedData);
        return;
      }

      // ── SUPPORTS ────────────────────────────────────────────────────────
      case "SUPPORTS": {
        const text = message.text ?? "";
        const chosen = parseIndexList(text, SUPPORTS);

        if (!chosen) {
          await ctx.reply(
            "⚠️ Sélection invalide. Envoyez les numéros des supports séparés par des virgules.\n\n" +
              SUPPORTS.map((s, i) => `  ${i + 1}. ${s.replace(/_/g, " ")}`).join(
                "\n",
              ),
            { parse_mode: "Markdown" },
          );
          return;
        }

        collectedData.supports = chosen;

        // After SUPPORTS, show the summary and ask for confirmation.
        const summaryText = buildSummaryMessage(collectedData);

        await upsertConversation(userId, {
          step: "SUMMARY",
          collected_data: collectedData as Record<string, unknown>,
        });

        await ctx.reply(summaryText, { parse_mode: "Markdown" });
        return;
      }

      // ── SUMMARY (waiting for user to read, they reply to confirm) ────────
      // The summary is displayed and the step advances to CONFIRMATION
      // as soon as the user sends any message — the actual yes/no is handled
      // in CONFIRMATION.  Re-displaying here handles the edge case where the
      // user sends a spurious message after the summary was shown.
      case "SUMMARY": {
        // Re-show the summary if the user sends something before confirming.
        const summaryText = buildSummaryMessage(collectedData);
        await ctx.reply(summaryText, { parse_mode: "Markdown" });
        // Advance to CONFIRMATION so the next message is treated as a reply.
        await upsertConversation(userId, {
          step: "CONFIRMATION",
          collected_data: collectedData as Record<string, unknown>,
        });
        return;
      }

      // ── CONFIRMATION ────────────────────────────────────────────────────
      case "CONFIRMATION": {
        const text = (message.text ?? "").trim().toLowerCase();

        if (text === "non" || text === "no" || text === "annuler") {
          // User declined — clear the conversation step.
          await upsertConversation(userId, {
            step: "LOGO",
            collected_data: {},
            active_project_id: null,
          });
          await ctx.reply(
            "❌ Projet annulé. Tapez /newbrand pour recommencer.",
          );
          return;
        }

        if (text !== "oui" && text !== "yes" && text !== "ok") {
          // Unrecognised reply — remind the user.
          await ctx.reply(
            "Tapez *oui* pour confirmer et lancer la génération, ou *non* pour annuler.",
            { parse_mode: "Markdown" },
          );
          return;
        }

        // ── User confirmed — create the project record and fire the pipeline.
        const project = await createProject(userId);

        await upsertConversation(userId, {
          step: "CONFIRMATION",
          collected_data: collectedData as Record<string, unknown>,
          active_project_id: project.id,
        });

        // Trigger the Inngest pipeline.
        await inngest.send({
          name: "brand-studio/project.start",
          data: {
            projectId: project.id,
            userId,
            collectedData,
          },
        });

        log.info("Project created and pipeline triggered", {
          projectId: project.id,
          step: "conversation:CONFIRMATION",
        });

        await ctx.reply(
          "🚀 *Votre projet est lancé !*\n\n" +
            `Identifiant : \`${project.id}\`\n\n` +
            "Je vous tiendrai informée à chaque étape de la génération. " +
            "Utilisez /status pour consulter l'avancement.",
          { parse_mode: "Markdown" },
        );
        return;
      }

      default: {
        // Exhaustiveness guard — should never happen at runtime.
        log.warn("processConversationStep: unknown step encountered", {
          step: `conversation:${currentStep as string}`,
        });
        await ctx.reply(
          "⚠️ Une erreur interne s'est produite. Tapez /newbrand pour recommencer.",
        );
      }
    }
  } catch (err) {
    log.error("processConversationStep failed", {
      step: "conversation",
      error: err,
    });
    await ctx.reply(
      "❌ Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants.",
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helper — advance to the next step
// ---------------------------------------------------------------------------

/**
 * Persist the new step + collected data, then reply with the next prompt.
 */
async function advanceTo(
  ctx: Context,
  userId: string,
  nextStep: ConversationStep,
  data: ConversationData,
): Promise<void> {
  await upsertConversation(userId, {
    step: nextStep,
    collected_data: data as Record<string, unknown>,
  });

  const prompt = stepPrompt(nextStep);
  if (prompt) {
    await ctx.reply(prompt, { parse_mode: "Markdown" });
  }
}

// ---------------------------------------------------------------------------
// Resume helper
// ---------------------------------------------------------------------------

/**
 * Send the prompt for the current persisted step.
 * Called by the webhook handler when a user resumes a /newbrand conversation
 * after an interruption (Requirement 6.2).
 *
 * @param ctx     grammY Context.
 * @param userId  String UUID of the authenticated user.
 */
export async function resumeConversation(
  ctx: Context,
  userId: string,
): Promise<void> {
  try {
    const conversation = await getConversation(userId);

    if (!conversation) {
      // No conversation found — start from the beginning.
      await upsertConversation(userId, { step: "LOGO", collected_data: {} });
      await ctx.reply(stepPrompt("LOGO"), { parse_mode: "Markdown" });
      return;
    }

    const currentStep = (conversation.step as ConversationStep) ?? "LOGO";
    const collectedData =
      (conversation.collected_data as ConversationData) ?? {};

    if (currentStep === "SUMMARY" || currentStep === "CONFIRMATION") {
      // Re-display the summary so the user can confirm.
      const summaryText = buildSummaryMessage(collectedData);
      await ctx.reply(summaryText, { parse_mode: "Markdown" });
      return;
    }

    const prompt = stepPrompt(currentStep);
    if (prompt) {
      await ctx.reply(
        `_Reprise de votre projet à l'étape en cours._\n\n${prompt}`,
        { parse_mode: "Markdown" },
      );
    }
  } catch (err) {
    log.error("resumeConversation failed", {
      step: "conversation:resume",
      error: err,
    });
    await ctx.reply(
      "❌ Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants.",
    );
  }
}

// ---------------------------------------------------------------------------
// Utility: step index (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Returns the 0-based index of a step in the canonical order.
 * Useful for comparing step progress.
 */
export function stepIndex(step: ConversationStep): number {
  return STEP_ORDER.indexOf(step);
}
