# Implementation Plan: Brand Studio

## Overview

Ce plan couvre les phases 2 à 10 du projet Brand Studio, dans l'ordre de la ROADMAP. Chaque tâche correspond à une étape concrète de code. Les sous-tâches marquées `*` sont optionnelles (tests) et peuvent être sautées pour un MVP plus rapide. Toutes les autres sous-tâches sont obligatoires.

Le projet est en TypeScript (Next.js). Les tests utilisent Vitest + fast-check pour les tests de propriété (PBT).

---

## Tasks

---

### Phase 2 — Socle technique

- [x] 1. Initialiser le projet Next.js TypeScript avec lint, tests et configuration de base
  - Créer le projet avec `create-next-app` (TypeScript strict, App Router, `src/` désactivé)
  - Configurer ESLint (règles TypeScript strictes) et Prettier
  - Créer `vitest.config.ts` avec `globals: true`, `environment: 'node'`
  - Créer `inngest.ts` à la racine (client Inngest)
  - Créer `next.config.ts`
  - _Exigences : 1.4_

  - [x] 1.1 Créer `lib/config/env.ts` — validation zod des variables d'environnement au démarrage
    - Déclarer le schéma zod de toutes les variables obligatoires (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_USER_ID`, `RODIUMAI_API_KEY`, `RODIUMAI_BASE_URL`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `SPEND_CAP_RODI`, `MAX_RETRIES`, `FILE_TTR_HOURS`)
    - Lancer `env.parse(process.env)` au démarrage ; afficher le nom de la variable manquante si parse échoue
    - Exporter le type `Env` inféré depuis le schéma
    - _Exigences : 1.1, 1.2, 1.3_

  - [ ]* 1.2 Écrire les tests unitaires de `env.ts`
    - Vérifier que chaque variable manquante produit une erreur nommée
    - Vérifier qu'une configuration complète passe sans erreur
    - _Exigences : 1.3_

  - [x] 1.3 Créer `.env.example` et mettre à jour `.gitignore`
    - Lister toutes les variables avec une valeur fictive dans `.env.example`
    - Ajouter `.env`, `.env.local`, `*.env` dans `.gitignore`
    - _Exigences : 1.1, 1.2_

- [x] 2. Créer le logger structuré JSON sans secrets
  - Créer `lib/logger.ts` implémentant le type `LogEntry` du design (champs `level`, `timestamp`, `projectId`, `step`, `message`, `userInputSummary`, `error`)
  - Tronquer `userInputSummary` à 100 caractères
  - Ne jamais inclure de stack trace dans les messages destinés aux utilisatrices
  - _Exigences : 1.5, 25.1, 25.2, 25.4_

  - [ ]* 2.1 Écrire les tests unitaires du logger
    - Vérifier qu'aucun champ ne contient de valeur de secret (mock des variables d'env)
    - Vérifier que `userInputSummary` est bien tronqué à 100 chars
    - _Exigences : 1.5, 25.1, 25.2_

- [x] 3. Créer le schéma Supabase par migrations
  - Créer `supabase/migrations/0001_initial_schema.sql` : tables `users`, `conversations`, `projects`, `project_assets`, `brand_profiles`, `generation_jobs`, `quality_checks`, `cost_records`, `delivery_records` avec les colonnes et contraintes du design
  - Créer `supabase/migrations/0002_rls_policies.sql` : activer RLS sur toutes les tables ; politique service-role uniquement
  - _Exigences : 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.1 Écrire le test d'intégration de migration (Supabase local)
    - Appliquer les migrations sur une base vide et vérifier que toutes les tables existent
    - _Exigences : 2.5_

- [x] 4. Créer le client Supabase et les types de base de données
  - Créer `lib/db/client.ts` (client server-side uniquement, service role key)
  - Créer `lib/db/types.ts` (types inférés depuis le schéma Supabase)
  - Créer `lib/db/queries/` avec un fichier par entité (projects, conversations, assets, costs, deliveries)
  - _Exigences : 2.3, 2.4_

- [x] 5. Créer la couche `ImageProvider` (abstraction RodiumAI images)
  - Créer `lib/config/models.ts` : modèles IA, limites RPM/RPD, prix unitaires en RODI — lu depuis la configuration uniquement
  - Créer `lib/ai/image-provider.ts` : interface `ImageProvider` + implémentation `RodiumAIImageProvider`
    - Vérifier le domaine contre `allowedDomains` avant tout appel
    - Redimensionner les images de référence si le corps dépasse 10 Mio
    - Implémenter le backoff exponentiel avec jitter sur erreur 429 (`Retry-After`)
    - Retourner le résultat en cache si la clé d'idempotence existe déjà en base
    - Propager une `StructuredImageError` (modèle, opération, tentatives) après `maxRetries`
  - _Exigences : 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 5.1 Écrire les tests unitaires de `ImageProvider`
    - Vérifier le refus d'URL hors liste blanche
    - Vérifier le retry sur 429 avec mock du header `Retry-After`
    - Vérifier que l'erreur structurée est bien propagée après `maxRetries`
    - Vérifier le redimensionnement automatique si le corps dépasse 10 Mio
    - _Exigences : 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.2 Écrire le test de propriété PBT pour l'idempotence de `ImageProvider`
    - `// Feature: brand-studio-full, Property 6: Idempotence des opérations coûteuses`
    - Pour toute clé d'idempotence déjà présente en base (mock), vérifier qu'aucun appel HTTP n'est émis et que le résultat retourné est identique
    - **Propriété 6 — Valide : Exigences 3.6, 10.5, 20.4**

- [x] 6. Créer le client LLM RodiumAI (chat + vision)
  - Créer `lib/ai/llm-client.ts` : fonctions `chat()` et `vision()` appelant l'API RodiumAI
  - Implémenter le même mécanisme de retry/backoff que `ImageProvider`
  - Ne jamais logguer les contenus de réponse LLM en clair
  - _Exigences : 3.3, 25.3_

- [x] 7. Checkpoint — Socle technique opérationnel
  - Vérifier que tous les tests passent (`vitest --run`)
  - Vérifier que la compilation TypeScript ne produit aucune erreur
  - S'assurer que `env.ts` refuse de démarrer avec une variable manquante
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 3 — Bot Telegram

- [x] 8. Créer le webhook Telegram avec autorisation et déduplication
  - Créer `app/api/telegram/route.ts` : handler `POST`
    - Vérifier le header `X-Telegram-Bot-Api-Secret-Token` → HTTP 403 si absent ou incorrect
    - Lire l'identifiant Telegram de l'expéditeur ; ignorer (sans réponse) si non autorisé
    - Dédupliquer par `update_id` (lecture en base)
    - Répondre HTTP 200 immédiatement (< 2 s) puis déclencher `inngest.send()`
  - Créer `lib/bot/messages.ts` : textes de tous les messages Telegram (centralisés)
  - _Exigences : 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 8.1 Écrire les tests unitaires du webhook
    - Tester HTTP 403 sur jeton secret absent ou incorrect
    - Tester l'ignorance silencieuse d'un expéditeur non autorisé
    - Tester la déduplication d'un `update_id` déjà vu
    - _Exigences : 4.1, 4.2, 4.3, 4.4_

  - [ ]* 8.2 Écrire le test de propriété PBT pour la déduplication Telegram
    - `// Feature: brand-studio-full, Property 11: Déduplication des mises à jour Telegram`
    - Pour tout `update_id` déjà en base, vérifier qu'aucune logique métier n'est déclenchée
    - **Propriété 11 — Valide : Exigence 4.4**

  - [ ]* 8.3 Écrire le test de propriété PBT pour l'isolation des utilisateurs non autorisés
    - `// Feature: brand-studio-full, Property 12: Isolation des utilisateurs non autorisés`
    - Pour tout `telegram_id` hors liste blanche (généré aléatoirement), vérifier qu'aucune réponse ni opération n'est émise
    - **Propriété 12 — Valide : Exigence 4.3**

- [x] 9. Implémenter les commandes Telegram et la machine à états du projet
  - Créer `lib/state/machine.ts` : type `ProjectState`, type `ProjectTransition`, constante `ALLOWED_TRANSITIONS`, implémentation de `StateMachine` (apply + current) avec persistence en base et horodatage
  - Créer `lib/bot/commands.ts` : handlers pour `/start`, `/help`, `/newbrand`, `/status`, `/cancel`
  - _Exigences : 5.1, 5.5, 18.1, 18.2, 18.3, 18.4_

  - [ ]* 9.1 Écrire les tests unitaires de la machine à états
    - Tester toutes les transitions autorisées
    - Tester le rejet et l'erreur sur toute transition interdite
    - _Exigences : 18.2, 18.3_

  - [ ]* 9.2 Écrire le test de propriété PBT — transitions valides mènent à un état terminal
    - `// Feature: brand-studio-full, Property 3: Transitions d'état valides mènent à un état terminal`
    - Générer aléatoirement des séquences de transitions autorisées depuis RECEIVED et vérifier que l'état final est COMPLETED, FAILED ou CANCELLED
    - **Propriété 3 — Valide : Exigence 18.5**

  - [ ]* 9.3 Écrire le test de propriété PBT — toute transition non autorisée est rejetée
    - `// Feature: brand-studio-full, Property 4: Transition non autorisée toujours rejetée`
    - Pour tout état et toute transition absente de `ALLOWED_TRANSITIONS[état]`, vérifier que l'erreur est levée et l'état inchangé
    - **Propriété 4 — Valide : Exigence 18.2**

- [x] 10. Implémenter le parcours conversationnel `/newbrand` et la reprise d'état
  - Créer `lib/bot/conversation.ts` : machine à états de conversation (étapes : logo → nom → secteur → public → positionnement → directions artistiques → supports → récapitulatif → confirmation)
  - Persister `step`, `collected_data` et `active_project_id` dans la table `conversations` après chaque interaction
  - Reprendre à l'étape persistée si la conversation est interrompue
  - Valider chaque champ texte (longueur 1–200 après trim ; rejeter whitespace-only)
  - Afficher le récapitulatif et l'estimation de coût avant de demander confirmation
  - _Exigences : 5.2, 5.3, 5.4, 5.6, 6.1, 6.2, 6.3_

  - [ ]* 10.1 Écrire les tests unitaires du parcours conversationnel
    - Tester la validation de chaque champ texte (longueur min, max, whitespace-only, caractères accentués)
    - Tester la reprise à l'étape correcte après interruption
    - _Exigences : 5.3, 6.2_

  - [ ]* 10.2 Écrire le test de propriété PBT pour la validation des champs texte
    - `// Feature: brand-studio-full, Property 7: Validation des champs texte du parcours /newbrand`
    - Pour toute chaîne dont la longueur après trim est < 1 ou > 200 ou composée uniquement d'espaces, vérifier le rejet et l'état de conversation inchangé
    - **Propriété 7 — Valide : Exigence 5.3**

- [x] 11. Checkpoint — Bot Telegram opérationnel
  - Vérifier que tous les tests passent (`vitest --run`)
  - S'assurer que le webhook répond en < 2 s sur un appel local mocké
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 4 — Analyse du logo et charte graphique

- [x] 12. Implémenter la validation du fichier logo
  - Créer `lib/files/validate.ts` : détection du type réel par magic bytes (PNG, JPEG, SVG), vérification taille (≤ 20 Mo), vérification dimensions (≤ max configuré)
  - Créer `lib/files/svg-sanitize.ts` : suppression des balises `<script>`, des handlers `on*`, des URL externes ; rastérisation sans accès réseau
  - Créer `lib/files/storage.ts` : upload/download Supabase Storage ; conserver `logo/original/` intact
  - _Exigences : 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 12.1 Écrire les tests unitaires de validation
    - Tester magic bytes : PNG valide, JPEG valide, SVG valide, PNG avec extension `.pdf`, fichier binaire non reconnu
    - Tester le rejet sur taille > 20 Mo
    - Tester la sanitisation SVG : script supprimé, handler `onload` supprimé, URL externe supprimée
    - _Exigences : 7.1, 7.2, 7.3, 7.5_

  - [ ]* 12.2 Écrire le test de propriété PBT pour la détection par magic bytes
    - `// Feature: brand-studio-full, Property 8: Détection du type réel par magic bytes`
    - Générer des buffers PNG/JPEG/SVG valides avec des extensions aléatoires déclarées et vérifier que le type détecté correspond aux octets de signature, pas à l'extension
    - **Propriété 8 — Valide : Exigence 7.1**

- [x] 13. Implémenter l'analyse déterministe du logo avec sharp
  - Créer `lib/analysis/deterministic.ts` : calcul dimensions (px), ratio (arrondi 4 décimales), `hasAlpha`, couleurs dominantes sur pixels opaques (alpha > 0), `lowResolutionWarning` si < seuil configuré
  - Définir `lib/analysis/types.ts` : types `BrandProfile`, `DominantColor`, `Uncertain` et schéma zod `brandProfileSchema`
  - _Exigences : 8.1, 8.2, 8.3, 8.4_

  - [ ]* 13.1 Écrire les tests unitaires de l'analyse déterministe
    - Tester les couleurs dominantes sur un PNG 100 % transparent (aucune contribution attendue)
    - Tester `lowResolutionWarning` sur une image sous le seuil
    - Vérifier que les valeurs `uncertain` ne sont jamais inventées
    - _Exigences : 8.2, 8.3, 8.4_

  - [ ]* 13.2 Écrire le test de propriété PBT — idempotence de l'analyse déterministe
    - `// Feature: brand-studio-full, Property 1: Idempotence de l'analyse déterministe du logo`
    - Pour tout logo PNG valide, exécuter l'analyse deux fois et vérifier que les deux BrandProfile sont identiques
    - **Propriété 1 — Valide : Exigence 8.5**

  - [ ]* 13.3 Écrire le test de propriété PBT — isolation des pixels transparents
    - `// Feature: brand-studio-full, Property 9: Isolation des pixels transparents dans le calcul des couleurs dominantes`
    - Pour tout PNG avec canal alpha, vérifier que les pixels avec alpha = 0 ne contribuent pas aux couleurs dominantes
    - **Propriété 9 — Valide : Exigence 8.2**

- [x] 14. Implémenter l'interprétation sémantique du logo via vision RodiumAI
  - Créer `lib/analysis/semantic.ts` : appel vision RodiumAI (resize < 10 Mio avant envoi), validation de la réponse par `brandProfileSchema`, marquage `uncertain` des champs non conformes
  - Traiter le texte retourné par le modèle comme non fiable (validation de longueur avant tout usage en prompt)
  - _Exigences : 9.1, 9.2, 9.3, 9.4_

  - [ ]* 14.1 Écrire les tests unitaires de l'analyse sémantique
    - Tester que les champs non conformes au schéma sont bien marqués `uncertain`
    - Tester le resize du logo avant envoi si > 10 Mio
    - _Exigences : 9.2, 9.3_

- [x] 15. Créer l'étape Inngest `analyze-logo` et persister le BrandProfile
  - Créer `jobs/analyze-logo.ts` : appeler `deterministic.ts` puis `semantic.ts`, merger les résultats, valider par schéma, persister dans `brand_profiles`, déclencher la transition `ANALYSIS_DONE`
  - _Exigences : 8.4, 9.1, 18.3_

- [x] 16. Implémenter la génération de la charte graphique via LLM
  - Définir `lib/strategy/types.ts` : types `Charter`, `ColorPalette`, `TypographyScale` et schéma zod `charterSchema`
  - Créer `lib/strategy/charter.ts` : construction du prompt LLM, appel `llm-client.ts`, validation par `charterSchema`, retry jusqu'à `maxRetries`, persistance et versionnement en base
  - Vérifier l'idempotence : si une charte est déjà persistée pour le projet, la retourner sans rappeler le LLM
  - _Exigences : 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 16.1 Écrire les tests unitaires de la génération de charte
    - Tester la validation zod d'une réponse LLM invalide et le retry
    - Tester l'idempotence (charte déjà en base → pas d'appel LLM)
    - _Exigences : 10.2, 10.5_

- [x] 17. Implémenter les sérialiseurs/désérialiseurs JSON avec round-trip
  - Créer les fonctions `serialize` / `deserialize` pour `BrandProfile` et `Charter` dans leurs modules respectifs, validées par zod à la désérialisation
  - _Exigences : 26.1, 26.2, 26.3, 26.4_

  - [ ]* 17.1 Écrire le test de propriété PBT — round-trip BrandProfile et Charte
    - `// Feature: brand-studio-full, Property 2: Round-trip de sérialisation (BrandProfile et Charte)`
    - Pour tout BrandProfile valide et toute Charte valide (générés aléatoirement par fast-check), vérifier que `deserialize(serialize(obj))` est structurellement équivalent à `obj`
    - **Propriété 2 — Valide : Exigences 26.1, 26.2, 26.3**

- [x] 18. Créer l'étape Inngest `brand-strategy` et câbler la planification des assets
  - Créer `jobs/brand-strategy.ts` : appeler `charter.ts`, transition `PLAN_READY` via `plan-assets.ts`
  - Créer `lib/planning/assets.ts` : plan d'assets par support (clé d'idempotence `hash(projectId + supportType + charterVersion)`), estimation coût total, vérification du plafond, persistance dans `project_assets`
  - Créer `jobs/plan-assets.ts`
  - _Exigences : 11.1, 11.2, 11.3, 11.4_

- [x] 19. Checkpoint — Analyse et charte opérationnels
  - Vérifier que tous les tests passent (`vitest --run`)
  - Vérifier que le BrandProfile et la Charte sont bien persistés en base sur un projet factice
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 5 — Moteur de composition MVP

- [x] 20. Créer la configuration des supports et les templates
  - Créer `lib/config/supports.ts` (et `templates/supports.config.ts`) : définir les 5 supports (avatar carré 1:1, bannière horizontale, carte de visite recto, publication carrée, publication verticale) avec dimensions exactes, marges, zones de sécurité, `logoMaxWidthRatio`, `printReady`
  - Toutes les valeurs dans un fichier de configuration versionné, aucune valeur en dur dans le code
  - _Exigences : 14.1, 14.2_

- [x] 21. Implémenter le module de pose du logo avec vérification de contraste
  - Créer `lib/compose/logo-placer.ts` : calcul de la position en respectant la zone de sécurité, vérification du ratio proportions (|ratio_composé / ratio_original - 1| ≤ 0,01), calcul du contraste WCAG (luminance relative), ajout d'un fond intermédiaire si contraste insuffisant (< 4,5:1 texte, < 3:1 graphique)
  - _Exigences : 13.1, 13.2, 13.3, 13.6_

  - [x]* 21.1 Écrire les tests unitaires de `logo-placer`
    - Tester le calcul de contraste WCAG (valeurs de luminance connues)
    - Tester l'ajout du fond intermédiaire si contraste < seuil
    - _Exigences : 13.3_

  - [ ]* 21.2 Écrire le test de propriété PBT — invariant de proportion du logo
    - `// Feature: brand-studio-full, Property 5: Invariant de proportion du logo composé`
    - Pour tout logo et tout support, vérifier que |ratio_composé / ratio_original - 1| ≤ 0,01 après composition
    - **Propriété 5 — Valide : Exigence 13.6**

- [x] 22. Implémenter le rendu texte via satori et le compositeur principal
  - Créer `lib/compose/text-renderer.ts` : rendu du nom de marque et du slogan via satori (polices OFL locales TTF/OTF/WOFF uniquement, pas WOFF2)
  - Créer `lib/compose/compositor.ts` : orchestration sharp/satori ; fond IA + logo + texte → PNG aux dimensions exactes du support
  - Vérifier que les polices utilisées sont uniquement celles définies dans la Charte
  - _Exigences : 13.4, 13.5_

- [x] 23. Créer les étapes Inngest de génération IA et de composition
  - Créer `jobs/generate-assets.ts` : 1 étape par support, appel `ImageProvider.generate()`, vérification idempotency_key avant appel, enregistrement du coût via `tracker.ts`
  - Créer `jobs/compose.ts` : 1 étape par support, appel `compositor.ts`, sauvegarde PNG dans Storage
  - _Exigences : 12.1, 12.2, 12.3, 12.4, 13.1, 13.5, 19.5_

  - [ ]* 23.1 Écrire les tests unitaires des étapes de génération et composition
    - Tester le skip d'un asset déjà produit (idempotency_key en base)
    - Tester l'enregistrement correct des coûts après génération
    - _Exigences : 11.4, 12.4_

- [x] 24. Checkpoint — Composition MVP opérationnelle
  - Vérifier que tous les tests passent (`vitest --run`)
  - Vérifier visuellement (relecture) que les assets produits pour un projet factice respectent les dimensions et la zone de sécurité du logo
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 6 — Contrôle qualité et révision

- [x] 25. Implémenter le contrôle qualité déterministe
  - Créer `lib/qc/checker.ts` : vérifier pour chaque asset les dimensions exactes (px), les proportions du logo (± 1 %), la présence et l'exactitude du nom de marque (comparaison stricte avec la saisie), le contraste WCAG
  - Distinguer erreurs bloquantes (dimensions fausses, logo déformé, nom de marque incorrect, livrable manquant) et avertissements (contraste limite, marge proche du minimum)
  - Toujours effectuer les vérifications déterministes avant tout appel vision IA
  - _Exigences : 15.1, 15.2, 15.5_

  - [x]* 25.1 Écrire les tests unitaires de `checker.ts`
    - Tester la détection d'une dimension incorrecte
    - Tester la détection d'un nom de marque avec casse différente
    - Tester la distinction erreur bloquante / avertissement
    - _Exigences : 15.1, 15.2_

- [x] 26. Implémenter le contrôle qualité par vision IA (optionnel)
  - Créer `lib/qc/vision-check.ts` : appel vision RodiumAI pour compléter les vérifications déterministes ; valider la réponse par schéma zod avant tout usage
  - _Exigences : 15.5_

- [x] 27. Implémenter la correction ciblée et l'étape Inngest de révision
  - Créer `jobs/quality-control.ts` : orchestration des vérifications, déclenchement de la correction ciblée sur erreur bloquante (recomposition ou régénération du seul élément fautif), transition `QA_FAIL` si erreur bloquante, transition `QA_PASS` si tous les assets sont conformes
  - Créer `jobs/revision.ts` : correction ciblée avec compteur de tentatives ; transition `MAX_RETRIES` si plafond atteint → projet FAILED avec liste d'erreurs dans la notification
  - _Exigences : 15.3, 15.4, 15.6_

  - [ ]* 27.1 Écrire les tests unitaires de la correction ciblée
    - Tester le passage à FAILED après `maxRetries` tentatives
    - Tester que seul l'asset fautif est recorrect (pas les autres)
    - _Exigences : 15.3, 15.4_

- [x] 28. Checkpoint — Contrôle qualité opérationnel
  - Vérifier que tous les tests passent (`vitest --run`)
  - S'assurer que le pipeline passe correctement de QA_RUNNING à EXPORTING sur un projet factice valide
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 7 — Guide de marque PDF et export ZIP

- [x] 29. Implémenter le générateur de PDF avec `@react-pdf/renderer`
  - Créer `lib/brandbook/pdf-generator.ts` : générer un PDF paginé en 14 sections obligatoires (présentation de la marque, logo et variantes, couleurs, typographie, espacement et grille, règles d'utilisation du logo, interdits, supports produits, mockups, guide d'impression, guide digital, contact, annexes)
  - Incorporer uniquement des polices OFL depuis `public/fonts/` (locales)
  - Tous les textes doivent être sélectionnables (non aplatis)
  - Vérifier la présence de toutes les sections ; lever une erreur bloquante si une section manque
  - _Exigences : 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x]* 29.1 Écrire les tests unitaires du générateur PDF
    - Tester la détection d'une section manquante et l'erreur bloquante correspondante
    - Tester que le PDF généré contient bien 14 sections (inspection de la structure)
    - _Exigences : 16.5_

- [x] 30. Implémenter le constructeur de ZIP et la livraison Telegram
  - Créer `lib/export/zip-builder.ts` : structure stable versionnée (`logo/`, `assets/`, `mockups/`, `brandbook/`, `README.txt`), génération du `README.txt` (liste fichiers, formats, dimensions, print/présentation), compression avec archiver, suppression des fichiers temporaires `temp/` après inclusion
  - Créer `lib/export/delivery.ts` : `sendDocument` si ZIP < 50 Mo, sinon lien signé Supabase Storage avec expiration
  - Créer `jobs/export-zip.ts` et `jobs/deliver.ts`
  - _Exigences : 17.1, 17.2, 17.3, 17.4_

  - [x]* 30.1 Écrire les tests unitaires de l'export ZIP
    - Tester que la structure du ZIP correspond exactement à la liste du README.txt
    - Tester la suppression des fichiers temporaires après inclusion
    - _Exigences : 17.4_

  - [ ]* 30.2 Écrire le test de propriété PBT — invariant de contenu du ZIP
    - `// Feature: brand-studio-full, Property 10: Invariant du contenu du ZIP`
    - Pour tout ensemble d'assets d'un projet complété, vérifier que la liste produite par décompression du ZIP correspond exactement à la liste déclarée dans le `README.txt`
    - **Propriété 10 — Valide : Exigence 17.5**

- [x] 31. Créer l'étape Inngest `brandbook` et câbler le pipeline complet
  - Créer `jobs/brandbook.ts` : appel `pdf-generator.ts`, sauvegarde PDF dans Storage
  - Câbler toutes les étapes : validate_file → analyze_logo → brand_strategy → plan_assets → generate_assets → compose → quality_control → (revision) → brandbook → export_zip → deliver
  - _Exigences : 16.1, 17.1, 19.5_

- [x] 32. Checkpoint — Pipeline complet de bout en bout
  - Vérifier que tous les tests passent (`vitest --run`)
  - Vérifier que le ZIP peut être décompressé et que son contenu correspond à la liste du README.txt
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 8 — Robustesse, coûts et nettoyage

- [x] 33. Implémenter le suivi des coûts et les plafonds de dépense
  - Créer `lib/costs/tracker.ts` : enregistrement de chaque opération coûteuse (fournisseur, modèle, opération, coût déclaré, coût estimé, tentatives, projectId, horodatage), cumul du coût par projet, arrêt immédiat si plafond dépassé pendant l'exécution, interrogation de `GET /v1/wallet` pour vérification du solde avant lancement
  - Idempotence stricte : ne jamais relancer une génération déjà réussie
  - _Exigences : 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 33.1 Écrire les tests unitaires du suivi des coûts
    - Tester l'arrêt au bon moment quand le plafond est dépassé
    - Tester l'idempotence (opération déjà réussie → pas de nouvel appel ni d'enregistrement)
    - _Exigences : 20.1, 20.4_

- [x] 34. Implémenter le backoff exponentiel global et la reprise Inngest
  - Vérifier que toutes les étapes Inngest utilisent le backoff exponentiel avec jitter pour les erreurs transitoires (réseau, 429, délai)
  - S'assurer que la reprise d'une étape interrompue repart depuis le dernier point de contrôle persisté sans régénérer les assets déjà produits
  - Vérifier que chaque étape vérifie l'état courant du projet avant de s'exécuter (idempotence)
  - _Exigences : 19.1, 19.2, 19.3, 19.4, 19.5_

  - [ ]* 34.1 Écrire les tests unitaires de la robustesse
    - Simuler une erreur 429 et vérifier le backoff (mock)
    - Simuler une interruption d'étape et vérifier la reprise sans régénération
    - _Exigences : 19.1, 19.2_

- [x] 35. Implémenter le nettoyeur de fichiers expirés (cron quotidien)
  - Créer la tâche planifiée Inngest (une exécution par jour) dans `jobs/cleanup.ts`
  - Supprimer les fichiers dans l'ordre : temporaires, ZIP, assets, logo (Logo_Original d'un projet COMPLETED supprimé seulement après TTR)
  - Supprimer immédiatement les fichiers d'un projet CANCELLED sans attendre la TTR
  - Enregistrer en base le nombre de fichiers supprimés et la taille libérée
  - Ne jamais supprimer les migrations ni les fichiers de configuration versionnés
  - _Exigences : 21.1, 21.2, 21.3, 21.4, 21.5_

  - [ ]* 35.1 Écrire les tests unitaires du nettoyeur
    - Tester l'ordre de suppression des fichiers
    - Tester la suppression immédiate des fichiers d'un projet CANCELLED
    - Tester la protection des migrations
    - _Exigences : 21.2, 21.4, 21.5_

- [x] 36. Implémenter les commandes d'administration pour la reprise manuelle
  - Ajouter dans `lib/bot/commands.ts` les commandes d'administration (protégées par un secret distinct) : relancer un projet depuis son dernier état valide, forcer le passage à CANCELLED avec suppression immédiate optionnelle
  - Vérifier que l'expéditeur est l'utilisatrice autorisée ET que le secret d'administration est correct ; ignorer sinon
  - _Exigences : 22.1, 22.2, 22.3_

  - [ ]* 36.1 Écrire les tests unitaires des commandes d'administration
    - Tester le rejet si le secret d'administration est absent ou incorrect
    - Tester que la commande de relance passe le projet au bon état
    - _Exigences : 22.3_

- [x] 37. Checkpoint — Robustesse et coûts opérationnels
  - Vérifier que tous les tests passent (`vitest --run`)
  - Simuler une erreur RodiumAI persistante et vérifier le passage en FAILED avec notification
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 9 — Mockups

- [x] 38. Implémenter la génération de mockups (4 catégories)
  - Étendre `lib/compose/compositor.ts` pour les mockups : générer des scènes IA pour les catégories cartes de visite, enseignes, vêtements, écrans, puis incruster le logo et les assets par code
  - Appliquer les règles de zone de sécurité du logo identiques aux autres supports
  - Si la déformation en perspective n'est pas supportée par sharp, livrer des mockups en cadre plat
  - Étiqueter tous les mockups avec la mention « présentation » dans les métadonnées du fichier et dans le ZIP
  - Ne jamais présenter un mockup comme « prêt à imprimer »
  - Créer la structure `mockups/{category}/` dans le ZIP
  - _Exigences : 23.1, 23.2, 23.3, 23.4_

  - [x]* 38.1 Écrire les tests unitaires des mockups
    - Tester la présence de la mention « présentation » dans les métadonnées
    - Tester que les règles de zone de sécurité sont bien appliquées sur les mockups
    - _Exigences : 23.2, 23.4_

- [x] 39. Documenter la limitation des mockups dans le README du ZIP
  - Mettre à jour `lib/export/zip-builder.ts` pour inclure dans le `README.txt` la mention de la limitation des mockups (cadre plat, absence de perspective) si applicable
  - _Exigences : 23.3_

- [x] 40. Checkpoint — Mockups opérationnels
  - Vérifier que tous les tests passent (`vitest --run`)
  - S'assurer que les mockups sont bien inclus dans le ZIP et étiquetés « présentation »
  - Poser les questions en suspens avant de passer à la phase suivante.

---

### Phase 10 — Documentation d'installation

- [x] 41. Rédiger le README d'installation complet
  - Créer `README.md` à la racine du dépôt couvrant : prérequis (Node, comptes), toutes les variables d'environnement à renseigner, étapes d'installation (clone, install, migrations, déploiement Vercel), commandes de test, procédure de restauration de la base Supabase
  - Lister toutes les interventions humaines nécessaires (création de comptes Supabase, Vercel, Inngest, clé RodiumAI, jeton BotFather, identifiant Telegram) avec les références aux documentations officielles
  - Documenter la procédure de sauvegarde et de restauration Supabase
  - _Exigences : 24.1, 24.2, 24.3, 24.4_

- [x] 42. Checkpoint final — Documentation complète
  - Vérifier que tous les tests passent sur une installation fraîche (`vitest --run`)
  - S'assurer que le README est suffisamment précis pour reproduire l'environnement sans aide supplémentaire
  - Poser les questions en suspens.

---

## Notes

- Les sous-tâches marquées `*` sont optionnelles et peuvent être sautées pour aller plus vite vers un MVP.
- Chaque tâche référence les exigences spécifiques pour la traçabilité.
- Les propriétés PBT (fast-check) sont étiquetées avec le format obligatoire : `// Feature: brand-studio-full, Property N: ...`
- Les checkpoints garantissent la validation incrémentale à chaque fin de phase.
- Les tests unitaires et PBT sont complémentaires : les unitaires couvrent les exemples concrets, les PBT les invariants universels.
- Une seule étape Inngest par support respecte la limite de 300 s de Vercel Hobby.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["4.1", "5.1", "5.2", "6.1"] },
    { "id": 3, "tasks": ["8.1", "8.2", "8.3", "9.1", "9.2", "9.3", "10.1", "10.2"] },
    { "id": 4, "tasks": ["12.1", "12.2", "13.1", "13.2", "13.3", "14.1"] },
    { "id": 5, "tasks": ["15.1", "16.1", "17.1"] },
    { "id": 6, "tasks": ["20.1", "21.1", "21.2"] },
    { "id": 7, "tasks": ["22.1", "23.1", "24.1", "25.1"] },
    { "id": 8, "tasks": ["26.1", "27.1"] },
    { "id": 9, "tasks": ["29.1", "30.1", "30.2", "31.1"] },
    { "id": 10, "tasks": ["33.1", "34.1", "35.1", "36.1"] },
    { "id": 11, "tasks": ["38.1", "39.1"] },
    { "id": 12, "tasks": ["41.1"] }
  ]
}
```
