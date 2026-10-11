# Architecture : AI Branding Studio

Statut : phase 1, conception. Aucun code n'a été écrit, aucun test n'a été exécuté.

## 1. Décisions structurantes

| Décision | Choix | Raison |
|---|---|---|
| Moteur d'orchestration | Next.js (TypeScript) + jobs Inngest, en remplacement de n8n | n8n Cloud est payant (essai de 14 jours seulement), n8n Cloud n'autorise ni modules npm ni Execute Command, et les exécutions sont comptées. Le cahier des charges initial (section 3) imposait n8n : cette contrainte est levée par la propriétaire du projet. |
| Utilisateurs | Une seule utilisatrice (liste d'autorisation Telegram) | Simplifie la sécurité et les volumes. |
| Hébergement | Vercel Hobby (usage personnel non commercial) | Gratuit, sans carte. Voir la note de licence ci-dessous. |
| Base et fichiers | Supabase gratuit (Postgres + Storage) | Gratuit, sans carte. |
| IA | RodiumAI (API compatible OpenAI, crédits RODI, Mobile Money) | Déjà utilisé par la propriétaire. |
| Composition | sharp + satori (+ resvg si nécessaire) | Le logo, les textes et les dimensions sont contrôlés par le code, jamais par l'IA. |
| PDF | @react-pdf/renderer (repli : Chromium serverless) | Léger, adapté au serverless. |
| Livraison | Telegram (ZIP < 50 Mo), sinon lien signé expirant | Limite d'envoi des bots : 50 Mo. |

Note de licence : Vercel Hobby est limité à l'usage personnel non commercial. Si le bot sert à livrer des travaux payés à des clients, il faudra passer à Pro ou changer d'hébergeur. À trancher avant tout usage commercial (le support Vercel peut confirmer les cas limites).

## 2. Vue d'ensemble

```
Telegram
   |  webhook (jeton secret)
   v
/api/telegram  (grammY)
   - vérifie le jeton secret et l'identifiant autorisé
   - déduplique par update_id
   - répond immédiatement à Telegram
   - met à jour l'état de conversation (Supabase)
   - envoie un événement à Inngest quand une commande est confirmée
   |
   v
Inngest (fonctions par étapes, reprise possible)
   validate_file -> analyze_logo -> brand_strategy -> plan_assets
   -> generate_assets -> compose -> quality_control -> (revision) 
   -> brandbook -> export_zip -> deliver
   |
   +--> RodiumAI (HTTP, fetch) : chat/vision, images
   +--> Supabase Postgres : état, charte, jobs, contrôles, coûts
   +--> Supabase Storage : logo original, assets, ZIP (rétention courte)
   +--> sharp / satori / react-pdf : composition et PDF (dans les étapes)
```

Chaque étape Inngest doit rester sous la limite de 300 s d'une fonction Vercel Hobby (2 Go, 1 vCPU). Un support = une étape, pour éviter les dépassements.

## 3. Correspondance avec les 15 workflows du cahier des charges

| Workflow initial | Module / fonction |
|---|---|
| 01_Telegram_Intake | `app/api/telegram` + `lib/bot/` |
| 02_File_Validation | `lib/files/validate` |
| 03_Logo_Analysis | `lib/analysis/logo` |
| 04_Brand_Strategy | `lib/strategy/` |
| 05_Asset_Planning | `lib/planning/` |
| 06_Asset_Generation | `jobs/generate-assets` + `lib/ai/` |
| 07_Design_Composition | `lib/compose/` + `templates/` |
| 08_Quality_Control | `lib/qc/` |
| 09_Revision_Manager | `jobs/revision` |
| 10_Brandbook_Generation | `lib/brandbook/` |
| 11_Export_And_Zip | `lib/export/` |
| 12_Telegram_Delivery | `lib/delivery/` |
| 13_Error_Recovery | gestion d'erreurs Inngest + reprise manuelle |
| 14_Cleanup_And_Retention | tâche de nettoyage (une exécution quotidienne, limite de Vercel Hobby) |
| 15_Usage_And_Cost_Tracking | table `cost_records` + `lib/costs/` |

## 4. Machine à états du projet

RECEIVED, VALIDATING, ANALYZING, STRATEGY_READY, GENERATING, COMPOSING, QA_RUNNING, REVISION_REQUIRED, EXPORTING, COMPLETED, FAILED, CANCELLED.

Règles : transitions autorisées définies dans un seul module ; chaque transition est enregistrée avec horodatage ; toute étape vérifie l'état courant avant de s'exécuter (idempotence) ; une relance ne régénère pas une image déjà produite (clé d'idempotence par support et par version de charte).

## 5. Parcours Telegram

Commandes : /start, /help, /newbrand, /status, /cancel.

/newbrand : logo (à envoyer comme document, pas comme photo, car Telegram compresse les photos), nom, secteur, public cible, positionnement, directions artistiques proposées, supports souhaités, récapitulatif, estimation du coût, confirmation, traitement avec messages de progression, aperçu, ZIP final.

L'état de la conversation est stocké en base (reprise après interruption). Les entrées de l'utilisatrice sont validées (longueur, caractères) avant d'être placées dans un prompt.

## 6. Analyse du logo

- Mesures déterministes avec sharp : dimensions, proportions, transparence, couleurs dominantes calculées sur les pixels opaques (jamais inventées par un modèle), détection de petite résolution.
- Interprétation sémantique (type de logo, symboles, présence de texte) : modèle de vision via RodiumAI. Le modèle de vision à utiliser doit être confirmé avec `GET /v1/models`.
- Sortie : `brand_profile.json` validé par un schéma ; les valeurs inconnues sont marquées `uncertain`.
- Un SVG fourni est rastérisé dans un contexte contrôlé (voir SECURITY.md).

## 7. Charte graphique

Un LLM produit la charte sous forme de JSON validé par schéma (couleurs, polices, échelle typographique, espacements, style, règles du logo, interdits). Elle est enregistrée en base et réutilisée par toutes les étapes. Aucune étape ne choisit sa propre palette.

## 8. Génération IA via RodiumAI

Contraintes documentées par RodiumAI (à revérifier à l'implémentation) :
- Endpoint images : `POST /v1/images/generations`, modèles cités dans la documentation : `openai/gpt-image-1`, `google/imagen-4.0-generate-001`, `google/gemini-3.1-flash-image`.
- Images de référence : uniquement pour les modèles Gemini Image (14 maximum, en base64 ou data URL, les URL HTTP sont refusées). Imagen et gpt-image refusent les images d'entrée.
- Corps de requête limité à 10 Mio : réduire le logo et les références avant envoi.
- Limites de débit par clé et par modèle (RPM, RPD), erreur 429 avec `Retry-After` : nouvelles tentatives avec délai progressif et nombre maximal.
- Imagen 4 peut ne plus être disponible chez Google depuis août 2026 : vérifier dans `GET /v1/models`.

L'IA produit uniquement fonds, scènes, textures et illustrations. Texte, logo et dimensions sont ajoutés par composition.

Couche d'abstraction : une interface `ImageProvider` configurable (modèle, prix, limites dans un fichier de configuration), pour ne pas dépendre d'un seul fournisseur.

## 9. Composition et fidélité du logo

- Fichier original conservé intact dans `logo/original/`.
- Templates par support (dimensions, marges, zones de sécurité, règles) dans `templates/`.
- satori : HTML/CSS vers SVG (polices TTF, OTF ou WOFF ; WOFF2 non pris en charge). sharp : SVG vers PNG et composition.
- Le logo est posé par transformation contrôlée : proportions respectées, zone de sécurité, contraste vérifié sur chaque fond.
- Mockups : première version avec cadres plats et scènes IA sans logo, logo incrusté par code. Une déformation en perspective n'est pas fournie par sharp à notre connaissance : à vérifier avant de promettre des mockups réalistes. Les mockups sont étiquetés « présentation », jamais « prêts à imprimer ».
- Vectorisation PNG vers SVG : hors MVP, optionnelle, signalée comme telle.

## 10. Contrôle qualité

Bloquant : fichier illisible ou vide, dimensions fausses, logo déformé, nom de marque incorrect, livrable obligatoire manquant.
Avertissement : contraste limite, marge proche du minimum, texte fictif signalé.
Méthode : tests déterministes d'abord (dimensions, proportions du logo par comparaison, contraste calculé, orthographe du nom comparée à la saisie), vision IA en complément. Correction ciblée (recomposition ou régénération de l'élément fautif) avec un nombre maximal de tentatives.

## 11. Livraison

Structure du ZIP conforme à la section 15 du cahier des charges, adaptée aux livrables réellement produits, avec un README décrivant contenu, formats, dimensions, fichiers prêts à imprimer et fichiers de présentation. ZIP envoyé par `sendDocument` s'il fait moins de 50 Mo, sinon lien signé expirant.

## 12. Données (aperçu, détail en phase suivante)

Tables : users (une seule ligne autorisée), conversations, projects, project_assets, brand_profiles, generation_jobs, quality_checks, cost_records, delivery_records. Les fichiers binaires restent dans Supabase Storage, la base ne contient que des références.

## 13. Points ouverts

1. Modèles réellement disponibles et tarifs en RODI : à lire via `GET /v1/models` et `GET /v1/pricing` avec une clé (non vérifié).
2. Conditions d'utilisation commerciale et conservation des données chez RodiumAI : à lire (pages Terms et Privacy) et à consigner dans SECURITY.md.
3. Usage commercial futur : bascule d'hébergeur ou plan Vercel Pro.
4. Qualité des mockups avec sharp seul : prototype à réaliser en phase 2.
5. Environnement local de développement (Node, Docker) : non inspecté, car ce dépôt est créé sans accès à la machine de la propriétaire.
