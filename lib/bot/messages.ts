/**
 * lib/bot/messages.ts — Telegram message strings for all bot commands.
 *
 * Centralises every user-visible text so UI copy can evolve without touching
 * command logic. All strings are written in French (the bot's target language).
 */

export const messages = {
  // ---------------------------------------------------------------------------
  // /start
  // ---------------------------------------------------------------------------
  start: `👋 Bienvenue sur Brand Studio !

Je génère automatiquement une identité visuelle complète à partir de votre logo.

Tapez /newbrand pour lancer un nouveau projet, ou /help pour découvrir toutes les commandes disponibles.`,

  // ---------------------------------------------------------------------------
  // /help
  // ---------------------------------------------------------------------------
  help: `📋 Commandes disponibles :

/newbrand — Lancer un nouveau projet d'identité visuelle
/status   — Afficher l'état du projet en cours
/cancel   — Annuler le projet en cours
/help     — Afficher ce message d'aide

Pour commencer, envoyez /newbrand et suivez les instructions.`,

  // ---------------------------------------------------------------------------
  // /newbrand
  // ---------------------------------------------------------------------------
  newbrand: `🎨 Lançons votre nouveau projet d'identité visuelle !

Envoyez-moi d'abord votre logo en tant que document (PNG, JPEG ou SVG, 20 Mo maximum).`,

  newbrandActiveProject: `⚠️ Vous avez déjà un projet en cours.

Utilisez /status pour voir son avancement ou /cancel pour l'annuler avant d'en démarrer un nouveau.`,

  // ---------------------------------------------------------------------------
  // /status
  // ---------------------------------------------------------------------------
  statusNoProject: `ℹ️ Vous n'avez pas de projet actif pour le moment.

Tapez /newbrand pour en démarrer un.`,

  statusTemplate: (state: string): string =>
    `📊 État de votre projet : *${state}*`,

  // ---------------------------------------------------------------------------
  // /cancel
  // ---------------------------------------------------------------------------
  cancelNoProject: `ℹ️ Aucun projet actif à annuler.`,

  cancelSuccess: `✅ Votre projet a bien été annulé.

Tapez /newbrand quand vous souhaitez recommencer.`,

  cancelAlreadyTerminal: `ℹ️ Le projet est déjà terminé (${""}) et ne peut plus être annulé.`,

  cancelFailed: `❌ Impossible d'annuler le projet pour le moment. Veuillez réessayer.`,

  // ---------------------------------------------------------------------------
  // Generic errors
  // ---------------------------------------------------------------------------
  genericError: `❌ Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants.`,
} as const;
