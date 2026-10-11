# Dépendances

Les numéros de version ne sont volontairement pas figés ici : ils seront choisis et verrouillés à l'installation (phase 2), après vérification de la documentation en vigueur. Aucune dépendance payante n'est prévue.

## Services externes

| Service | Rôle | Plan | Limites à connaître (sources consultées en octobre 2026) |
|---|---|---|---|
| Vercel | Hébergement Next.js | Hobby (gratuit, sans carte) | Usage personnel non commercial. Fonctions : 300 s maximum, 2 Go, 1 vCPU. Tâches planifiées : une fois par jour. Quotas mensuels dont 4 heures de CPU actif et 1 million d'invocations. Les projets Hobby sont suspendus au dépassement. |
| Supabase | Postgres + Storage | Gratuit | Base 500 Mo, stockage 1 Go, 5 Go de sortie, pause après 7 jours d'inactivité, aucune sauvegarde. Base en lecture seule si 500 Mo dépassés. Liens signés : 7 jours maximum. |
| Inngest | Jobs par étapes, reprises | Gratuit | 50 000 exécutions par mois (chaque étape compte), 5 étapes simultanées. |
| RodiumAI | LLM, vision, images | Crédits RODI (payant, Mobile Money) | Corps de requête 10 Mio, limites RPM/RPD par clé et par modèle, 429 avec `Retry-After`. Références d'images : Gemini Image uniquement. |
| Telegram Bot API | Interface utilisateur | Gratuit | Envoi de fichiers 50 Mo, téléchargement 20 Mo, photos compressées. |

Alternative d'orchestration si Inngest ne convient pas : Trigger.dev (plan gratuit, pas de plafond de durée imposé par la plateforme).
Alternative d'hébergement si usage commercial : Vercel Pro (20 $/mois) ou un autre hébergeur autorisant l'usage commercial gratuit (à vérifier).

## Bibliothèques

| Besoin | Choix | Alternative |
|---|---|---|
| Framework | Next.js (TypeScript) | - |
| Bot Telegram | grammY | Telegraf |
| Jobs | SDK Inngest | SDK Trigger.dev |
| Base et stockage | client Supabase (JS) | - |
| Images | sharp | - |
| HTML/CSS vers SVG | satori | - |
| SVG vers PNG | resvg-js (si besoin) ou sharp (librsvg) | - |
| PDF | @react-pdf/renderer | puppeteer-core + @sparticuz/chromium-min |
| ZIP | archiver ou jszip | - |
| Validation de schémas | zod | - |
| Tests | Vitest | Jest |
| Types de fichiers | détection par signature (magic bytes) | - |

Points de vigilance :
- satori n'accepte pas les polices WOFF2 (TTF, OTF, WOFF seulement). Utiliser des polices libres (licence OFL) pour pouvoir les incorporer.
- Chromium sur Vercel demande un paquet dédié et alourdit les démarrages à froid : à éviter tant que react-pdf suffit.
- sharp n'est pas un moteur de perspective (à vérifier) : prévoir un prototype pour les mockups.

## Outils de développement

Node.js (version LTS à confirmer), gestionnaire de paquets au choix, Git. Docker n'est plus nécessaire (Gotenberg et n8n abandonnés).

## À obtenir par la propriétaire

Comptes Vercel, Supabase, Inngest ; jeton BotFather ; identifiant Telegram ; clé API RodiumAI (`rd_sk_...`). Aucun de ces secrets ne doit être placé dans le dépôt.
