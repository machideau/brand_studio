# Feuille de route

Principe : une première version fonctionnelle de bout en bout, puis des améliorations. On ne passe à la phase suivante que lorsque les critères de validation sont satisfaits et testés. Rien n'est déclaré fonctionnel sans test.

## Phase 1 : analyse et conception (en cours)

Livrables : ARCHITECTURE, ROADMAP, DEPENDENCIES, COSTS, SECURITY.
Validation : documents relus et décisions confirmées par la propriétaire.

## Phase 2 : socle technique

Tâches : projet Next.js (TypeScript), configuration lint et tests, `.env.example`, `.gitignore`, schéma Supabase (migrations), connexion à Supabase, couche `ImageProvider` et client RodiumAI, journalisation sans secrets.
Intervention humaine : création des comptes Supabase, Vercel, Inngest ; clé API RodiumAI ; jeton du bot Telegram (BotFather) ; identifiant Telegram de la propriétaire.
Validation : tests unitaires du schéma de configuration ; appel réel à `GET /v1/models` et `GET /v1/wallet` réussi avec la vraie clé (sinon : non validé).

## Phase 3 : bot Telegram

Tâches : webhook, jeton secret, liste d'autorisation, déduplication par update_id, commandes, parcours /newbrand, état de conversation en base, annulation, reprise.
Validation : tests unitaires des transitions ; test réel avec le vrai bot (message, annulation, reprise après interruption).

## Phase 4 : analyse du logo et charte

Tâches : validation de fichiers (type réel, taille), mesure des couleurs par pixels, interprétation par modèle de vision, `brand_profile.json`, schéma de charte, génération et persistance de la charte.
Jeu de test : logos PNG transparents, JPEG fond blanc, SVG valides, fichiers invalides, logos avec texte, monochromes, petite résolution, noms accentués et longs.
Validation : couleurs mesurées comparées à des valeurs connues ; fichiers invalides rejetés proprement.

## Phase 5 : moteur de composition (MVP graphique)

Tâches : templates et règles pour 4 à 5 supports (avatar, bannière, carte de visite, publication carrée, publication verticale), pose du logo avec zone de sécurité, vérification de contraste, génération de fonds via RodiumAI.
Validation : sorties aux dimensions exactes ; logo comparé à l'original (proportions) ; relecture visuelle par la propriétaire.

## Phase 6 : contrôle qualité et révision

Tâches : contrôles techniques, graphiques, sémantiques ; distinction erreurs bloquantes et avertissements ; correction ciblée avec limite de tentatives.

## Phase 7 : guide de marque PDF et export

Tâches : PDF paginé (14 sections du cahier des charges), polices libres incorporées, ZIP à structure stable, README du pack, livraison Telegram ou lien signé.
Validation : PDF ouvert et inspecté page par page ; ZIP décompressé et comparé à la liste attendue.

## Phase 8 : robustesse, coûts, nettoyage

Tâches : plafond de dépense par projet, estimation avant confirmation, reprise manuelle des projets bloqués, nettoyage des fichiers expirés, suivi des coûts.
Validation : simulation d'erreurs d'API (429, délai dépassé, indisponibilité), interruption en cours de traitement, échec d'envoi Telegram.

## Phase 9 : mockups et améliorations

Tâches : mockups (cartes, enseignes, vêtements, écrans), prototype de perspective, supports supplémentaires, vectorisation optionnelle.

## Phase 10 : documentation d'installation

Tâches : README d'installation, variables d'environnement, déploiement, sauvegarde et restauration, reproduction de l'installation à partir de la documentation seule.

## Hors périmètre actuel

Multi-utilisateurs, paiement, abonnement, hébergement commercial (à réévaluer si le bot sert des clients payants).
