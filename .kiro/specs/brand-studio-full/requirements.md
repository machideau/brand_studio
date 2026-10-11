# Requirements Document

## Introduction

Brand Studio est un bot Telegram personnel destiné à une seule utilisatrice. À partir d'un logo envoyé par l'utilisatrice, le système génère automatiquement une identité visuelle complète : charte graphique, assets pour plusieurs supports, guide de marque PDF paginé et mockups. L'ensemble du traitement est orchestré par des jobs Inngest (avec reprise possible) déclenchés par le bot, hébergés sur Vercel Hobby, avec Supabase pour la base de données et le stockage. La génération d'images et l'analyse sémantique sont déléguées à RodiumAI ; la composition, le texte et le logo sont entièrement contrôlés par du code.

Ce document couvre les phases 2 à 10 du projet.

---

## Glossary

- **Bot** : le bot Telegram Brand Studio, seul point d'entrée de l'utilisatrice.
- **Système** : l'ensemble de l'application (Next.js + Inngest + Supabase + bibliothèques).
- **Utilisatrice** : la propriétaire du bot ; la seule personne dont l'identifiant Telegram est dans la liste d'autorisation.
- **Projet** : une demande de création d'identité visuelle initiée par `/newbrand`, identifiée par un UUID en base.
- **Logo_Original** : le fichier image (PNG, JPEG ou SVG) envoyé par l'utilisatrice comme point de départ d'un projet.
- **Brand_Profile** : l'objet JSON validé par schéma décrivant les couleurs, les proportions et les caractéristiques sémantiques du logo.
- **Charte** : l'objet JSON validé par schéma décrivant les couleurs, les polices, les espacements, le style et les règles du logo pour un projet.
- **Asset** : un fichier image produit pour un support donné (avatar, bannière, carte de visite, publication carrée, publication verticale, mockup).
- **Support** : un type de livrable graphique, défini par ses dimensions, ses marges et ses règles de composition.
- **ImageProvider** : la couche d'abstraction sur l'API de génération d'images de RodiumAI.
- **Validateur** : le module de validation de fichiers (type réel, taille, dimensions).
- **Analyseur** : le module d'analyse du logo (mesures déterministes avec sharp + interprétation par vision IA).
- **Compositeur** : le module de composition graphique (sharp + satori).
- **Contrôleur_QC** : le module de contrôle qualité.
- **Exporteur** : le module de génération du ZIP et du PDF.
- **Nettoyeur** : la tâche planifiée de suppression des fichiers et projets expirés.
- **Suivi_Coûts** : le module de suivi des dépenses par projet.
- **Machine_A_Etats** : le module de gestion des transitions d'état d'un projet.
- **RODI** : unité de crédit de la plateforme RodiumAI.
- **TTR** : durée de rétention configurable des fichiers (entre 24 h et 72 h par défaut).

---

## Requirements

---

### Exigence 1 : Socle technique — projet et configuration

**User Story :** En tant que développeuse, je veux un projet Next.js TypeScript correctement configuré avec lint, tests et variables d'environnement, afin de disposer d'une base fiable pour toutes les phases suivantes.

#### Critères d'acceptation

1. THE Système SHALL exposer un fichier `.env.example` contenant tous les noms de variables d'environnement requises sans aucune valeur réelle.
2. THE Système SHALL ignorer les fichiers `.env`, `.env.local` et tout fichier contenant des secrets lors des commits Git (via `.gitignore`).
3. THE Système SHALL valider la configuration d'environnement au démarrage via un schéma zod ; IF une variable obligatoire est absente ou mal formée, THEN THE Système SHALL refuser de démarrer et afficher le nom de la variable manquante dans les journaux.
4. THE Système SHALL exécuter la suite de tests Vitest sans erreur sur une installation fraîche.
5. THE Système SHALL produire des journaux structurés (format JSON) ne contenant aucun secret, aucune clé API, aucun jeton.

---

### Exigence 2 : Socle technique — schéma Supabase

**User Story :** En tant que développeuse, je veux un schéma de base de données Supabase versionné par migrations, afin que la structure soit reproductible et traçable.

#### Critères d'acceptation

1. THE Système SHALL gérer le schéma Supabase exclusivement par des fichiers de migration numérotés et ordonnés.
2. THE Système SHALL activer Row Level Security sur toutes les tables de la base.
3. THE Système SHALL créer les tables `users`, `conversations`, `projects`, `project_assets`, `brand_profiles`, `generation_jobs`, `quality_checks`, `cost_records` et `delivery_records` via les migrations.
4. THE Système SHALL stocker les fichiers binaires (logo, assets, ZIP) dans Supabase Storage et ne conserver que les références (chemins ou identifiants) en base.
5. WHEN une migration est appliquée sur une base vide, THE Système SHALL créer l'intégralité du schéma sans erreur.

---

### Exigence 3 : Socle technique — couche ImageProvider

**User Story :** En tant que développeuse, je veux une couche d'abstraction sur l'API RodiumAI, afin de pouvoir changer de modèle ou de fournisseur sans modifier le code de composition.

#### Critères d'acceptation

1. THE ImageProvider SHALL lire le modèle, les limites de débit et le prix unitaire depuis un fichier de configuration, jamais depuis le code source.
2. WHEN une requête de génération d'image est envoyée, THE ImageProvider SHALL inclure le corps de la requête dans la limite de 10 Mio en redimensionnant les images de référence si nécessaire.
3. WHEN l'API RodiumAI retourne une erreur 429, THE ImageProvider SHALL attendre la durée indiquée par l'en-tête `Retry-After` puis réessayer, jusqu'au nombre maximal de tentatives configuré.
4. IF le nombre maximal de tentatives est atteint sans succès, THEN THE ImageProvider SHALL propager une erreur structurée identifiant le modèle, l'opération et le nombre de tentatives effectuées.
5. THE ImageProvider SHALL appeler uniquement les domaines configurés dans la liste blanche ; aucune URL fournie par l'utilisatrice ne sera suivie.
6. WHEN une image est déjà produite pour un support et une version de charte donnés, THE ImageProvider SHALL retourner l'image existante sans appeler l'API (idempotence).

---

### Exigence 4 : Bot Telegram — réception et autorisation

**User Story :** En tant qu'utilisatrice, je veux que le bot ne réponde qu'à moi, afin que mes crédits RodiumAI ne soient pas consommés par d'autres personnes.

#### Critères d'acceptation

1. WHEN le Bot reçoit une mise à jour Telegram, THE Bot SHALL vérifier que le jeton secret du webhook est présent et correct avant tout traitement.
2. IF le jeton secret du webhook est absent ou incorrect, THEN THE Bot SHALL retourner HTTP 403 sans traitement.
3. WHEN le Bot reçoit un message dont l'identifiant Telegram de l'expéditeur n'est pas dans la liste d'autorisation, THE Bot SHALL ignorer le message sans envoyer de réponse à l'expéditeur.
4. THE Bot SHALL dédupliquer les mises à jour par `update_id` : WHEN un `update_id` déjà traité est reçu, THE Bot SHALL acquitter la requête sans retraitement.
5. THE Bot SHALL répondre à Telegram dans un délai permettant d'éviter le renvoi automatique (sous 2 secondes), puis déclencher le traitement de façon asynchrone.

---

### Exigence 5 : Bot Telegram — commandes et parcours /newbrand

**User Story :** En tant qu'utilisatrice, je veux un parcours guidé pour créer une identité visuelle, afin de fournir toutes les informations nécessaires sans me tromper d'étape.

#### Critères d'acceptation

1. THE Bot SHALL répondre aux commandes `/start`, `/help`, `/newbrand`, `/status` et `/cancel`.
2. WHEN l'utilisatrice envoie `/newbrand`, THE Bot SHALL demander séquentiellement : le logo (à envoyer comme document), le nom de marque, le secteur d'activité, le public cible, le positionnement, les directions artistiques parmi une liste proposée, et les supports souhaités.
3. THE Bot SHALL valider chaque champ texte saisi (nom, secteur, public, positionnement) : la longueur doit être comprise entre 1 et 200 caractères ; IF la longueur est hors plage, THEN THE Bot SHALL demander une nouvelle saisie.
4. WHEN toutes les informations sont collectées, THE Bot SHALL afficher un récapitulatif et l'estimation du coût du projet, puis demander une confirmation explicite avant de lancer le traitement.
5. IF l'utilisatrice envoie `/cancel` à tout moment pendant le parcours ou le traitement, THEN THE Bot SHALL annuler le projet en cours, passer l'état du projet à CANCELLED et confirmer l'annulation par message.
6. THE Bot SHALL persister l'état de conversation en base après chaque étape, afin de permettre la reprise après une interruption.
7. WHEN un projet est en cours de traitement, THE Bot SHALL envoyer des messages de progression à chaque changement d'état majeur.

---

### Exigence 6 : Bot Telegram — état de conversation et reprise

**User Story :** En tant qu'utilisatrice, je veux pouvoir reprendre une conversation interrompue, afin de ne pas perdre les informations déjà saisies.

#### Critères d'acceptation

1. THE Système SHALL stocker l'étape courante, les données collectées et l'identifiant du projet actif dans la table `conversations` après chaque interaction.
2. WHEN l'utilisatrice envoie un message après une interruption, THE Bot SHALL reprendre la conversation à l'étape où elle s'était arrêtée.
3. WHILE un projet est dans l'état COMPLETED, FAILED ou CANCELLED, THE Bot SHALL proposer de démarrer un nouveau projet si l'utilisatrice envoie `/newbrand`.

---

### Exigence 7 : Validation du fichier logo

**User Story :** En tant qu'utilisatrice, je veux que le bot détecte et rejette les fichiers invalides immédiatement, afin de ne pas consommer de crédits sur un logo inexploitable.

#### Critères d'acceptation

1. THE Validateur SHALL détecter le type réel du fichier par ses octets de signature (magic bytes), indépendamment de l'extension ou du type MIME déclaré.
2. THE Validateur SHALL accepter uniquement les types PNG, JPEG et SVG ; IF le type réel est différent, THEN THE Validateur SHALL rejeter le fichier avec un message d'erreur indiquant le type détecté.
3. THE Validateur SHALL rejeter tout fichier dont la taille dépasse 20 Mo.
4. THE Validateur SHALL rejeter toute image dont les dimensions dépassent les dimensions maximales configurées.
5. WHEN un fichier SVG est reçu, THE Validateur SHALL supprimer les balises `<script>`, les gestionnaires d'événements (`on*`) et les références à des URL externes, puis rastériser le SVG sans accès réseau.
6. WHEN un fichier est rejeté, THE Bot SHALL informer l'utilisatrice de la raison du rejet et lui demander un nouveau fichier.
7. THE Validateur SHALL conserver le fichier original tel quel dans `logo/original/` sans le modifier.

---

### Exigence 8 : Analyse du logo — mesures déterministes

**User Story :** En tant que développeuse, je veux des mesures de logo fiables et reproductibles, afin que la charte graphique soit fondée sur des données objectives.

#### Critères d'acceptation

1. THE Analyseur SHALL calculer les dimensions en pixels, le ratio largeur/hauteur, la présence d'un canal alpha et les couleurs dominantes du logo en utilisant uniquement sharp (sans appel à un modèle IA).
2. THE Analyseur SHALL calculer les couleurs dominantes sur les pixels opaques uniquement (canal alpha > 0) ; les pixels transparents ne contribuent pas au calcul.
3. THE Analyseur SHALL détecter si la résolution est inférieure au seuil minimal configuré et le signaler comme avertissement dans le Brand_Profile.
4. THE Analyseur SHALL produire un `brand_profile.json` valide selon le schéma zod défini ; les valeurs non mesurables sont marquées `uncertain` plutôt qu'inventées.
5. FOR ALL logos PNG valides, l'exécution successive de l'analyse SHALL produire un Brand_Profile identique (propriété d'idempotence).

---

### Exigence 9 : Analyse du logo — interprétation sémantique

**User Story :** En tant qu'utilisatrice, je veux que le bot comprenne le contenu visuel de mon logo, afin que la charte reflète son style.

#### Critères d'acceptation

1. WHEN le Brand_Profile est produit, THE Analyseur SHALL envoyer l'image du logo à RodiumAI (modèle de vision) pour obtenir le type de logo (iconique, lettrage, combiné, emblème), la présence de texte, les symboles identifiés et le style perçu.
2. THE Analyseur SHALL valider la réponse du modèle de vision par le schéma zod du Brand_Profile avant de l'intégrer ; IF la réponse ne correspond pas au schéma, THEN THE Analyseur SHALL marquer les champs non conformes comme `uncertain`.
3. THE Analyseur SHALL réduire le logo à une taille inférieure à 10 Mio avant envoi à RodiumAI.
4. THE Analyseur SHALL traiter le texte retourné par le modèle de vision comme une donnée non fiable : ce texte ne sera pas inséré dans un prompt sans validation de longueur.

---

### Exigence 10 : Génération de la charte graphique

**User Story :** En tant qu'utilisatrice, je veux une charte graphique cohérente générée automatiquement, afin d'avoir une identité visuelle homogène sur tous les supports.

#### Critères d'acceptation

1. WHEN le Brand_Profile est disponible et validé, THE Système SHALL envoyer au LLM de RodiumAI le Brand_Profile et les informations de marque pour générer une charte en JSON.
2. THE Système SHALL valider la charte retournée par le LLM avec le schéma zod de la Charte ; IF la charte ne correspond pas au schéma, THEN THE Système SHALL réessayer jusqu'au nombre maximal de tentatives configuré.
3. THE Charte SHALL contenir : palette de couleurs (primaire, secondaire, accentuation, fond, texte), famille de polices principale et secondaire (polices à licence OFL uniquement), échelle typographique, espacements, style visuel, règles d'utilisation du logo et interdits.
4. THE Système SHALL persister la Charte validée en base et l'associer au projet ; toutes les étapes de composition suivantes liront la même Charte.
5. WHEN une Charte est déjà persistée pour un projet, THE Système SHALL utiliser la Charte existante sans en générer une nouvelle (idempotence).

---

### Exigence 11 : Planification des assets

**User Story :** En tant que développeuse, je veux un plan d'assets structuré avant toute génération, afin de contrôler les coûts et d'organiser le traitement.

#### Critères d'acceptation

1. WHEN la Charte est validée, THE Système SHALL produire un plan listant chaque Asset à générer avec son Support, son modèle IA prévu, son coût estimé en RODI et sa clé d'idempotence.
2. THE Système SHALL calculer l'estimation de coût total du projet en sommant les coûts unitaires des Assets planifiés ; cette estimation sera présentée à l'utilisatrice avant confirmation.
3. IF le coût estimé total dépasse le plafond de dépense configuré, THEN THE Système SHALL avertir l'utilisatrice et demander une confirmation explicite avant de continuer.
4. THE Système SHALL persister le plan d'assets en base ; WHEN un Asset est déjà produit (clé d'idempotence existante), THE Système SHALL le marquer comme déjà disponible sans le régénérer.

---

### Exigence 12 : Génération des fonds et scènes IA

**User Story :** En tant qu'utilisatrice, je veux des fonds et des scènes générés par IA cohérents avec ma charte, afin d'avoir des visuels originaux et adaptés à ma marque.

#### Critères d'acceptation

1. THE ImageProvider SHALL générer les fonds, scènes, textures et illustrations en respectant le style, la palette et les mots-clés définis dans la Charte.
2. THE Système SHALL ne jamais demander à l'IA de composer le logo, d'insérer du texte ou de décider des dimensions ; ces opérations sont réservées au Compositeur.
3. WHEN la génération d'un fond échoue après le nombre maximal de tentatives, THE Système SHALL passer l'état du projet à FAILED et notifier l'utilisatrice avec le détail de l'erreur.
4. THE Suivi_Coûts SHALL enregistrer pour chaque appel de génération : fournisseur, modèle, résolution, coût déclaré (si fourni par l'API), coût estimé (marqué comme estimation), nombre de tentatives, identifiant de projet.

---

### Exigence 13 : Composition graphique des supports

**User Story :** En tant qu'utilisatrice, je veux des assets aux dimensions exactes avec mon logo posé fidèlement, afin d'avoir des livrables prêts à l'emploi.

#### Critères d'acceptation

1. THE Compositeur SHALL produire chaque Asset aux dimensions exactes définies pour son Support (en pixels), sans débordement ni déformation.
2. THE Compositeur SHALL poser le Logo_Original en respectant : les proportions d'origine, la zone de sécurité définie dans la Charte, et un contraste suffisant sur le fond.
3. WHEN le contraste entre le logo et le fond est inférieur au seuil WCAG AA (ratio 4,5:1 pour le texte, 3:1 pour les éléments graphiques), THE Compositeur SHALL ajouter un fond intermédiaire ou un contour pour garantir la lisibilité.
4. THE Compositeur SHALL insérer le texte (nom de marque, slogan) en utilisant uniquement les polices définies dans la Charte, chargées depuis les fichiers locaux.
5. THE Compositeur SHALL utiliser sharp pour la composition finale (PNG) et satori pour la conversion HTML/CSS vers SVG intermédiaire le cas échéant ; aucun outil tiers non listé dans DEPENDENCIES.md ne sera introduit.
6. FOR ALL supports produits, le ratio largeur/hauteur du logo posé SHALL être égal au ratio du Logo_Original à ±1 % (propriété d'invariant).

---

### Exigence 14 : Supports couverts par le MVP

**User Story :** En tant qu'utilisatrice, je veux au moins quatre à cinq types de supports, afin de couvrir mes besoins de communication immédiatement.

#### Critères d'acceptation

1. THE Compositeur SHALL produire les supports suivants : avatar carré (1:1), bannière horizontale, carte de visite (recto), publication carrée réseaux sociaux, publication verticale réseaux sociaux.
2. THE Système SHALL définir les dimensions, marges et zones de sécurité de chaque Support dans un fichier de configuration versionné, jamais en dur dans le code.
3. WHEN un Support n'est pas demandé par l'utilisatrice dans son récapitulatif, THE Compositeur SHALL l'exclure du plan d'assets sans générer de fichier pour ce Support.

---

### Exigence 15 : Contrôle qualité

**User Story :** En tant qu'utilisatrice, je veux que chaque livrable soit vérifié automatiquement, afin de ne recevoir que des assets conformes à ma charte.

#### Critères d'acceptation

1. THE Contrôleur_QC SHALL vérifier chaque Asset produit : dimensions exactes du Support, proportions du logo dans la tolérance de ±1 %, présence du nom de marque correct (comparaison avec la saisie), contraste WCAG calculé.
2. THE Contrôleur_QC SHALL distinguer les erreurs bloquantes (fichier illisible, dimensions fausses, logo déformé, nom de marque incorrect, livrable obligatoire manquant) des avertissements (contraste limite, marge proche du minimum).
3. IF une erreur bloquante est détectée sur un Asset, THEN THE Contrôleur_QC SHALL déclencher une correction ciblée (recomposition ou régénération du seul élément fautif) dans la limite du nombre maximal de tentatives configuré.
4. IF le nombre maximal de tentatives de correction est atteint sans résoudre l'erreur bloquante, THEN THE Contrôleur_QC SHALL passer l'état du projet à FAILED et lister les erreurs dans la notification à l'utilisatrice.
5. THE Contrôleur_QC SHALL effectuer les vérifications déterministes (dimensions, proportions, contraste) avant tout appel à la vision IA.
6. WHEN tous les Assets obligatoires sont conformes (sans erreur bloquante), THE Contrôleur_QC SHALL valider le projet et déclencher l'étape d'export.

---

### Exigence 16 : Guide de marque PDF

**User Story :** En tant qu'utilisatrice, je veux un guide de marque PDF paginé complet, afin de pouvoir partager les règles de mon identité visuelle.

#### Critères d'acceptation

1. THE Exporteur SHALL générer un PDF paginé en 14 sections couvrant : présentation de la marque, logo et variantes, couleurs, typographie, espacement et grille, règles d'utilisation du logo, interdits, supports produits, mockups, guide d'impression, guide digital, contact, et annexes.
2. THE Exporteur SHALL incorporer dans le PDF uniquement des polices à licence OFL chargées depuis les fichiers locaux.
3. THE Exporteur SHALL utiliser `@react-pdf/renderer` pour la génération du PDF.
4. THE Exporteur SHALL produire un PDF dont tous les textes sont sélectionnables (non aplatis en image).
5. WHEN le PDF est généré, THE Exporteur SHALL vérifier que toutes les sections obligatoires sont présentes en inspectant la structure du document ; IF une section manque, THEN THE Exporteur SHALL lever une erreur bloquante.

---

### Exigence 17 : Export ZIP et livraison

**User Story :** En tant qu'utilisatrice, je veux recevoir tous mes fichiers dans un ZIP organisé, afin de retrouver facilement chaque livrable.

#### Critères d'acceptation

1. THE Exporteur SHALL produire un ZIP dont la structure de répertoires est stable et versionnée dans la configuration : `logo/`, `assets/`, `mockups/`, `brandbook/`, et un fichier `README.txt` à la racine.
2. THE Exporteur SHALL inclure dans le `README.txt` : la liste des fichiers, leurs formats, leurs dimensions, et la distinction entre fichiers « prêts à imprimer » et fichiers « présentation ».
3. WHEN le ZIP fait moins de 50 Mo, THE Bot SHALL l'envoyer via `sendDocument` ; IF le ZIP fait 50 Mo ou plus, THEN THE Bot SHALL générer un lien signé Supabase Storage avec expiration et l'envoyer à l'utilisatrice.
4. THE Exporteur SHALL supprimer les fichiers temporaires intermédiaires après l'inclusion dans le ZIP.
5. FOR ALL projets complétés, la décompression du ZIP SHALL produire exactement les fichiers listés dans le `README.txt` (propriété d'invariant).

---

### Exigence 18 : Machine à états du projet

**User Story :** En tant que développeuse, je veux que les transitions d'état soient contrôlées et tracées, afin de garantir la cohérence du traitement et de faciliter le débogage.

#### Critères d'acceptation

1. THE Machine_A_Etats SHALL définir les états valides : RECEIVED, VALIDATING, ANALYZING, STRATEGY_READY, GENERATING, COMPOSING, QA_RUNNING, REVISION_REQUIRED, EXPORTING, COMPLETED, FAILED, CANCELLED.
2. THE Machine_A_Etats SHALL autoriser uniquement les transitions explicitement définies ; IF une transition non autorisée est tentée, THEN THE Machine_A_Etats SHALL rejeter la transition et lever une erreur.
3. THE Machine_A_Etats SHALL enregistrer chaque transition en base avec un horodatage et l'identifiant de l'étape Inngest ayant déclenché la transition.
4. WHEN une étape Inngest s'exécute, THE Système SHALL vérifier que l'état courant du projet correspond à l'état attendu avant d'exécuter la logique de l'étape (idempotence).
5. FOR ALL séquences de transitions valides, l'état final SHALL être COMPLETED, FAILED ou CANCELLED (propriété de complétude).

---

### Exigence 19 : Robustesse et gestion des erreurs

**User Story :** En tant qu'utilisatrice, je veux que le système récupère automatiquement des erreurs transitoires, afin que mon projet ne soit pas bloqué par une défaillance temporaire.

#### Critères d'acceptation

1. WHEN une étape Inngest échoue avec une erreur transitoire (réseau, 429, délai dépassé), THE Système SHALL relancer l'étape avec un délai progressif (backoff exponentiel) dans la limite du nombre maximal de tentatives configuré.
2. WHEN une étape Inngest a été interrompue (déploiement, crash), THE Système SHALL reprendre l'étape depuis le dernier point de contrôle persisté sans régénérer les Assets déjà produits.
3. IF RodiumAI est indisponible pendant toutes les tentatives, THEN THE Système SHALL passer le projet à FAILED, persister le détail de l'erreur et notifier l'utilisatrice.
4. IF l'envoi Telegram du ZIP échoue, THEN THE Système SHALL réessayer jusqu'au nombre maximal de tentatives, puis générer et envoyer un lien signé Supabase Storage en substitut.
5. THE Système SHALL respecter la limite de 300 secondes par fonction Vercel en découpant chaque Support en une étape Inngest distincte.

---

### Exigence 20 : Plafonds de dépense et estimation des coûts

**User Story :** En tant qu'utilisatrice, je veux contrôler mes dépenses en crédits RODI, afin de ne pas dépasser mon budget à mon insu.

#### Critères d'acceptation

1. THE Suivi_Coûts SHALL lire le plafond de dépense maximum par projet depuis la configuration ; IF le coût cumulé d'un projet dépasse ce plafond pendant l'exécution, THEN THE Système SHALL arrêter toute opération coûteuse et passer le projet à FAILED.
2. THE Bot SHALL afficher l'estimation du coût total calculée par le Système avant de demander la confirmation de lancement ; cette estimation doit être explicitement présentée comme une estimation, jamais comme un coût garanti.
3. THE Suivi_Coûts SHALL interroger `GET /v1/wallet` de RodiumAI de façon périodique pour vérifier le solde disponible ; IF le solde est inférieur au coût estimé du projet, THEN THE Système SHALL avertir l'utilisatrice avant de continuer.
4. THE Suivi_Coûts SHALL ne jamais relancer une génération d'image déjà produite avec succès (idempotence stricte des appels coûteux).
5. THE Suivi_Coûts SHALL enregistrer pour chaque opération : fournisseur, modèle, opération, coût déclaré (si fourni par l'API), coût estimé, nombre de tentatives, identifiant de projet, horodatage.

---

### Exigence 21 : Nettoyage et rétention des fichiers

**User Story :** En tant que développeuse, je veux que les fichiers expirés soient supprimés automatiquement, afin de rester dans le quota Supabase Storage de 1 Go.

#### Critères d'acceptation

1. THE Nettoyeur SHALL s'exécuter une fois par jour (seule exécution planifiée autorisée par Vercel Hobby) et supprimer de Supabase Storage les fichiers dont l'âge dépasse la TTR configurée.
2. THE Nettoyeur SHALL supprimer les fichiers dans l'ordre : fichiers temporaires d'abord, puis ZIP, puis assets, puis logo ; le Logo_Original d'un projet COMPLETED ne sera supprimé qu'après la TTR.
3. THE Nettoyeur SHALL enregistrer en base le nombre de fichiers supprimés et la taille libérée lors de chaque exécution.
4. WHEN un projet est passé à l'état CANCELLED, THE Nettoyeur SHALL pouvoir supprimer immédiatement ses fichiers sans attendre la TTR.
5. THE Nettoyeur SHALL ne jamais supprimer les migrations de base de données ni les fichiers de configuration versionnés.

---

### Exigence 22 : Reprise manuelle des projets bloqués

**User Story :** En tant qu'utilisatrice, je veux pouvoir reprendre ou forcer l'arrêt d'un projet bloqué, afin de ne pas perdre mes crédits sur un projet en état indéfini.

#### Critères d'acceptation

1. THE Bot SHALL exposer une commande d'administration protégée par un secret distinct permettant de relancer un projet depuis son dernier état valide.
2. THE Bot SHALL exposer une commande d'administration permettant de forcer le passage d'un projet à l'état CANCELLED, avec suppression immédiate de ses fichiers si demandé.
3. WHEN une commande d'administration est reçue, THE Bot SHALL vérifier que l'expéditeur est l'utilisatrice autorisée ET que le secret d'administration est correct ; IF l'une des deux conditions n'est pas satisfaite, THEN THE Bot SHALL ignorer la commande.

---

### Exigence 23 : Mockups

**User Story :** En tant qu'utilisatrice, je veux des mockups de présentation sur des objets réels (cartes, enseignes, vêtements, écrans), afin de visualiser mon identité visuelle en situation.

#### Critères d'acceptation

1. THE Compositeur SHALL produire des mockups en incrustant le logo et les assets par code sur des scènes générées par RodiumAI, pour les catégories : cartes de visite, enseignes, vêtements, écrans.
2. THE Compositeur SHALL étiqueter tous les mockups avec la mention « présentation » dans le fichier et dans le ZIP ; aucun mockup ne sera présenté comme « prêt à imprimer ».
3. WHERE la déformation en perspective n'est pas supportée par sharp, THE Système SHALL livrer des mockups en cadre plat et documenter cette limitation dans le README du ZIP.
4. THE Compositeur SHALL appliquer les règles de zone de sécurité du logo sur les mockups dans les mêmes termes que sur les autres supports.

---

### Exigence 24 : Documentation d'installation

**User Story :** En tant que développeuse, je veux une documentation d'installation complète, afin de pouvoir recréer l'environnement de production à partir de zéro.

#### Critères d'acceptation

1. THE Système SHALL fournir un fichier `README.md` à la racine du dépôt décrivant : les prérequis, les variables d'environnement à renseigner, les étapes d'installation (clone, install, migrations, déploiement), les commandes de test et la procédure de restauration de la base.
2. THE Système SHALL documenter la procédure de sauvegarde et de restauration de la base Supabase.
3. WHEN les instructions du README sont suivies sur une machine fraîche avec les bons secrets, THE Système SHALL démarrer sans erreur et passer les tests unitaires.
4. THE Système SHALL lister dans le README toutes les interventions humaines nécessaires (création de comptes, génération de jetons, configuration BotFather) avec les références aux documentations officielles correspondantes.

---

### Exigence 25 : Sécurité — journalisation et données sensibles

**User Story :** En tant que développeuse, je veux que les journaux ne contiennent aucune donnée sensible, afin d'éviter toute fuite accidentelle de secrets ou de données personnelles.

#### Critères d'acceptation

1. THE Système SHALL produire des journaux ne contenant aucune valeur de clé API, de jeton Telegram, de jeton secret webhook, ni de chemin complet de fichiers contenant des données utilisateur.
2. THE Système SHALL traiter le contenu des champs texte saisis par l'utilisatrice comme des données non fiables : ils ne seront pas inclus dans les journaux sans troncature à 100 caractères maximum.
3. THE Système SHALL valider toutes les sorties de LLM par un schéma zod avant tout usage ; IF la sortie ne correspond pas au schéma, THEN THE Système SHALL rejeter la sortie et consigner l'erreur dans les journaux sans inclure le contenu de la sortie en clair.
4. THE Système SHALL ne jamais exposer les erreurs internes (stack traces, chemins de fichiers serveur) dans les messages envoyés à l'utilisatrice via Telegram.

---

### Exigence 26 : Parseurs et sérialiseurs — propriétés de round-trip

**User Story :** En tant que développeuse, je veux que les données JSON critiques puissent être sérialisées et désérialisées sans perte, afin de garantir la cohérence des données entre les étapes.

#### Critères d'acceptation

1. THE Système SHALL sérialiser et désérialiser le Brand_Profile et la Charte en JSON via des fonctions dédiées validées par zod.
2. FOR ALL Brand_Profile valides, la désérialisation du JSON produit par la sérialisation SHALL retourner un objet équivalent au Brand_Profile d'origine (propriété de round-trip).
3. FOR ALL Chartes valides, la désérialisation du JSON produit par la sérialisation SHALL retourner un objet équivalent à la Charte d'origine (propriété de round-trip).
4. THE Système SHALL définir un schéma zod pour chaque format JSON persisté ou échangé entre modules ; aucun objet non validé par schéma ne transitera entre deux étapes Inngest.
