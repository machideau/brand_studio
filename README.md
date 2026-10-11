# Brand Studio

> Système automatisé de génération d'identités visuelles et de brand packs complets pour petites entreprises, orchestré via un bot Telegram, Next.js 16, Supabase, Inngest, Sharp et Satori.

---

## Sommaire

1. [Présentation et Architecture](#présentation-et-architecture)
2. [Prérequis](#prérequis)
3. [Interventions manuelles et comptes tiers](#interventions-manuelles-et-comptes-tiers)
4. [Variables d'environnement](#variables-denvironnement)
5. [Installation et Démarrage rapide](#installation-et-démarrage-rapide)
6. [Base de données et Migrations Supabase](#base-de-données-et-migrations-supabase)
7. [Configuration du Bot Telegram](#configuration-du-bot-telegram)
8. [Configuration Inngest](#configuration-inngest)
9. [Tests et Qualité](#tests-et-qualité)
10. [Déploiement sur Vercel](#déploiement-sur-vercel)
11. [Procédures de Sauvegarde et Restauration Supabase](#procédures-de-sauvegarde-et-restauration-supabase)
12. [Commandes d'Administration](#commandes-dadministration)

---

## Présentation et Architecture

Brand Studio transforme un logo initial en une identité visuelle complète et cohérente :
- **Entrée** : conversation guidée via Telegram (`/newbrand`) avec upload du logo (PNG, JPEG, SVG) et validation stricte (magic bytes, max 20 Mo, sanitisation SVG).
- **Analyse du logo** : analyse déterministe via Sharp (dimensions, ratio, couleurs dominantes sur pixels opaques) combinée à une vision sémantique RodiumAI.
- **Charte graphique** : synthèse via LLM structuré (Zod) avec palette de couleurs (WCAG), typographies OFL locales, règles de composition et liste d'interdits.
- **Moteur de composition** : composition déterministe via Sharp et Satori (bannières, avatars, cartes de visite, publications réseaux sociaux). Aucun rendu de typographie ou logo par IA générative ; l'IA génère uniquement des textures d'arrière-plan abstraites.
- **Mockups de présentation** : génération de 4 scènes (cartes de visite, enseignes, vêtements, écrans) étiquetées explicitement « présentation ».
- **Brandbook & Export** : génération d'un guide de marque PDF en 14 sections obligatoires avec polices OFL sélectionnables (`@react-pdf/renderer`) et compression d'un pack ZIP complet (`archiver`) avec `README.txt` descriptif.

---

## Prérequis

- **Node.js** : version `22.x` (LTS recommandée)
- **Gestionnaire de paquets** : `npm` v10+ (ou `pnpm` v9+)
- **Système d'exploitation** : Linux, macOS ou Windows WSL2
- **Comptes de services tiers** :
  - Compte [Supabase](https://supabase.com) (Postgres + Storage S3)
  - Compte [Telegram](https://telegram.org) pour la création du bot
  - Compte [Inngest](https://www.inngest.com) pour l'orchestration des jobs
  - Accès à l'API [RodiumAI](https://rodium.ai) (LLM et Vision)
  - Compte [Vercel](https://vercel.com) pour l'hébergement de l'application Next.js

---

## Interventions manuelles et comptes tiers

Avant de lancer le système, vous devez configurer les services externes suivants :

| Service | Intervention requise | Référence officielle |
|---|---|---|
| **Telegram / BotFather** | 1. Contacter `@BotFather` sur Telegram.<br>2. Créer un nouveau bot (`/newbot`) et noter le `TELEGRAM_BOT_TOKEN`.<br>3. Récupérer votre identifiant utilisateur Telegram via `@userinfobot` pour `TELEGRAM_ALLOWED_USER_ID`.<br>4. Définir les commandes du bot (`/newbrand`, `/status`, `/help`, etc.). | [Telegram Bot Documentation](https://core.telegram.org/bots/tutorial) |
| **Supabase** | 1. Créer un nouveau projet sur le tableau de bord Supabase.<br>2. Noter l'URL du projet et la clé `service_role` (Settings > API).<br>3. Créer un bucket de stockage nommé `brand-studio` (privé). | [Supabase Quickstart](https://supabase.com/docs/guides/getting-started) |
| **Inngest** | 1. Créer un compte sur inngest.com.<br>2. Créer une application et récupérer `INNGEST_EVENT_KEY` et `INNGEST_SIGNING_KEY`.<br>3. Configurer l'URL de synchronisation vers votre domaine Vercel : `https://votre-domaine.vercel.app/api/inngest`. | [Inngest Next.js Setup](https://www.inngest.com/docs/quick-start) |
| **RodiumAI** | 1. Créer une clé API sur le portail RodiumAI.<br>2. Noter la base URL et la clé API pour renseigner `RODIUMAI_API_KEY` et `RODIUMAI_BASE_URL`. | [RodiumAI Documentation](https://rodium.ai/docs) |
| **Vercel** | 1. Importer le dépôt Git.<br>2. Configurer les variables d'environnement dans le projet Vercel.<br>3. Activer le déploiement sur la branche `main`. | [Vercel Next.js Deployment](https://vercel.com/docs/frameworks/nextjs) |

---

## Variables d'environnement

Créer un fichier `.env.local` à la racine du projet en copiant `.env.example` :

```bash
cp .env.example .env.local
```

### Table des variables requises

| Variable | Description | Exemple |
|---|---|---|
| `SUPABASE_URL` | URL de votre instance Supabase | `https://xyzproject.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète `service_role` Supabase (accès admin base et bucket) | `eyJhbGciOi...` |
| `TELEGRAM_BOT_TOKEN` | Jeton d'authentification du bot Telegram fourni par BotFather | `123456789:ABCdefGhI...` |
| `TELEGRAM_WEBHOOK_SECRET` | Chaîne secrète pour valider l'authenticité des requêtes webhook Telegram et des commandes d'admin | `super-secret-random-token-42` |
| `TELEGRAM_ALLOWED_USER_ID` | Identifiant Telegram numérique de l'utilisatrice autorisée (whitelist mono-utilisatrice) | `987654321` |
| `RODIUMAI_API_KEY` | Clé d'API pour les modèles LLM et Vision RodiumAI | `rodi-xxxxxxxxxxxxxxxxxxxx` |
| `RODIUMAI_BASE_URL` | URL de base de l'API RodiumAI | `https://api.rodiumai.example.com` |
| `INNGEST_SIGNING_KEY` | Clé de signature Inngest pour vérifier les appels webhook | `signkey-prod-xxxxxxxx` |
| `INNGEST_EVENT_KEY` | Clé Inngest pour émettre des événements depuis l'application | `fake-inngest-event-key` |
| `SPEND_CAP_RODI` | Plafond de dépense total autorisé par projet en unités Rodi | `100` |
| `MAX_RETRIES` | Nombre maximal de tentatives de révision ciblée en cas d'échec de contrôle qualité | `3` |
| `FILE_TTR_HOURS` | Durée de conservation (TTR) en heures des fichiers d'un projet avant purge automatique par le cron | `48` |

> [!CAUTION]
> Ne commitez jamais vos fichiers `.env` ou `.env.local` dans le dépôt Git. Les clés `SUPABASE_SERVICE_ROLE_KEY` et `TELEGRAM_BOT_TOKEN` confèrent des droits administratifs complets.

---

## Installation et Démarrage rapide

### 1. Cloner le dépôt et installer les dépendances

```bash
git clone https://github.com/votre-compte/brand_studio.git
cd brand_studio
npm install
```

### 2. Appliquer les migrations Supabase

Connectez-vous à votre instance Supabase et exécutez les fichiers SQL situés dans `supabase/migrations/` (voir section dédiée).

### 3. Lancer le serveur de développement Next.js

```bash
npm run dev
```

L'application écoute par défaut sur `http://localhost:3000`.

### 4. Lancer le Dev Server Inngest en local

Dans un terminal séparé :

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

L'interface web Inngest sera accessible sur `http://localhost:8288` pour inspecter l'exécution de toutes les étapes et déclencher des événements de test.

---

## Base de données et Migrations Supabase

Le schéma de base de données est géré via des fichiers de migration versionnés dans le dossier `supabase/migrations/` :

1. `0001_initial_schema.sql` : Tables principales (`conversations`, `projects`, `brand_profiles`, `charters`, `project_assets`, `cost_tracking`, `quality_checks`, `cleanups`).
2. `0002_rls_policies.sql` : Activation de la Row Level Security (RLS) et politiques d'accès.
3. `0003_charter_column.sql` : Ajustement des colonnes JSONB pour la charte graphique.

### Application des migrations via Supabase CLI

```bash
# Lier le projet local à votre projet Supabase distant
npx supabase link --project-ref votre-project-ref

# Appliquer toutes les migrations en attente
npx supabase db push
```

### Alternative : Application via l'éditeur SQL du Dashboard Supabase

Si vous n'utilisez pas la CLI Supabase, ouvrez l'onglet **SQL Editor** dans la console Supabase et exécutez le contenu des 3 fichiers de migration dans l'ordre numérique :
1. Copier/coller le contenu de `supabase/migrations/0001_initial_schema.sql` et cliquer sur **Run**.
2. Copier/coller le contenu de `supabase/migrations/0002_rls_policies.sql` et cliquer sur **Run**.
3. Copier/coller le contenu de `supabase/migrations/0003_charter_column.sql` et cliquer sur **Run**.

### Configuration du Storage Supabase

1. Rendez-vous dans la section **Storage** de Supabase.
2. Créez un bucket nommé `brand-studio`.
3. Désactivez l'accès public (les téléchargements volumineux se font via URLs signées à durée de validité limitée).

---

## Configuration du Bot Telegram

### Enregistrement du Webhook Telegram

Pour que Telegram transmette les messages reçus à votre API Next.js :

```bash
curl -F "url=https://votre-domaine.vercel.app/api/telegram/webhook" \
     -F "secret_token=VOTRE_TELEGRAM_WEBHOOK_SECRET" \
     https://api.telegram.org/bot<VOTRE_TELEGRAM_BOT_TOKEN>/setWebhook
```

### Vérification du statut du Webhook

```bash
curl https://api.telegram.org/bot<VOTRE_TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

### Commandes supportées par le bot

- `/start` : Message de bienvenue et explication du flux.
- `/newbrand` : Démarre le parcours conversationnel guidé de création de marque.
- `/status` : Affiche l'état d'avancement du projet actif.
- `/cancel` : Annule le projet en cours et réinitialise la conversation.
- `/help` : Affiche l'aide détaillée et les consignes d'utilisation.

---

## Configuration Inngest

Le point d'entrée de l'API Inngest est exposé sur :
`https://votre-domaine.vercel.app/api/inngest`

Il enregistre et orchestre les 11 fonctions suivantes :
1. `validate-file` : Validation par magic bytes et sanitisation SVG du logo.
2. `analyze-logo` : Analyse déterministe Sharp et sémantique RodiumAI.
3. `brand-strategy` : Génération de la charte via LLM.
4. `plan-assets` : Planification des assets par support et vérification du plafond budgétaire.
5. `generate-assets` : Génération des textures et arrière-plans IA (1 étape par support).
6. `compose` : Composition déterministe Sharp/Satori + mockups de présentation.
7. `quality-control` : Contrôle qualité déterministe (dimensions, ratios, contraste WCAG, nom de marque).
8. `revision` : Révision ciblée de l'élément non conforme avec gestion des tentatives (`maxRetries`).
9. `brandbook` : Génération du guide PDF paginé en 14 sections avec `@react-pdf/renderer`.
10. `export-zip` : Compression du pack ZIP avec `archiver` et `README.txt`.
11. `deliver` : Envoi du document Telegram (< 50 Mo) ou URL signée Supabase (≥ 50 Mo).
12. `cleanup` : Tâche planifiée quotidienne de purge des fichiers expirés ou annulés.

---

## Tests et Qualité

La suite de tests automatisée couvre les invariants métier, la robustesse aux erreurs, la validation et les générateurs de livrables :

### Exécuter la suite complète de tests

```bash
npm test
```

### Exécuter les tests en mode watch

```bash
npm run test:watch
```

### Vérifier le typage TypeScript

```bash
npx tsc --noEmit
```

### Vérifier le linting

```bash
npm run lint
```

---

## Déploiement sur Vercel

1. Connectez votre dépôt GitHub sur le tableau de bord [Vercel](https://vercel.com).
2. Configurez toutes les variables d'environnement listées dans la section [Variables d'environnement](#variables-denvironnement) dans les paramètres du projet (Settings > Environment Variables).
3. Déployez le projet sur la branche principale.
4. Une fois déployé, enregistrez l'URL du webhook Telegram avec la commande `curl` vue précédemment.
5. Dans votre tableau de bord Inngest Cloud, synchronisez votre nouvelle URL d'API : `https://votre-domaine.vercel.app/api/inngest`.

> [!NOTE]
> L'orchestration Inngest découpe chaque support en une étape distincte, garantissant une exécution largement inférieure au plafond de 300 secondes de Vercel Hobby.

---

## Procédures de Sauvegarde et Restauration Supabase

### Procédure de Sauvegarde (Backup)

Pour exporter l'intégralité du schéma et des données de la base Supabase :

```bash
# Via Supabase CLI
npx supabase db dump --project-ref votre-project-ref -f backup_$(date +%Y%m%d_%H%M%S).sql

# Ou via pg_dump avec l'URI de connexion PostgreSQL directe
pg_dump "postgresql://postgres:VOTRE_MOT_DE_PASSE@db.votre-project-ref.supabase.co:5432/postgres" \
  --format=c \
  --file=supabase_backup_$(date +%Y%m%d_%H%M%S).dump
```

### Procédure de Restauration (Disaster Recovery)

En cas de perte de données ou pour réinitialiser un environnement de test :

```bash
# 1. Réinitialiser la base de données
npx supabase db reset --linked

# 2. Restaurer à partir du fichier de dump SQL
psql "postgresql://postgres:VOTRE_MOT_DE_PASSE@db.votre-project-ref.supabase.co:5432/postgres" \
  < backup_fichier.sql
```

> [!TIP]
> Supabase effectue également des sauvegardes quotidiennes automatiques (Point-in-Time Recovery disponible selon le plan de facturation).

---

## Commandes d'Administration

Le bot intègre des commandes d'administration réservées à l'utilisatrice autorisée (`TELEGRAM_ALLOWED_USER_ID`) et protégées par la clé secrète `TELEGRAM_WEBHOOK_SECRET` :

### Relancer un projet bloqué

Pour relancer l'exécution d'un projet depuis son dernier état valide :

```text
/admin_resume <project_id> <secret>
```

### Annuler et purger immédiatement un projet

Pour forcer le passage d'un projet à l'état `CANCELLED` et purger immédiatement tous ses fichiers de stockage :

```text
/admin_cancel <project_id> <secret> purge
```

Si le mot-clé optionnel `purge` est omis, le projet passe à l'état `CANCELLED` et ses fichiers seront nettoyés lors du prochain passage du cron quotidien `cleanup`.

---

## Licence

Ce projet est sous licence MIT.
Les polices incluses dans `public/fonts/` (Noto Sans) sont distribuées sous licence libre [SIL Open Font License (OFL)](http://scripts.sil.org/OFL).
