# Sécurité et confidentialité

Contexte : une seule utilisatrice, mais un bot Telegram public par nature (n'importe qui peut lui écrire) et des crédits payants derrière.

## 1. Accès

- Liste d'autorisation : le bot ignore tout message dont l'identifiant Telegram n'est pas celui de la propriétaire. Réponse neutre ou silence.
- Jeton secret du webhook Telegram vérifié sur chaque requête ; route non devinable.
- Déduplication par `update_id` (Telegram renvoie les messages si la réponse tarde).
- Les routes d'administration (reprise manuelle, nettoyage) exigent un secret distinct.

## 2. Secrets

- Clés et jetons uniquement dans les variables d'environnement de l'hébergeur ; `.env.example` sans valeurs réelles ; `.env` ignoré par Git.
- La clé « service » Supabase n'est utilisée que côté serveur. Row Level Security activée sur toutes les tables.
- Journaux sans secrets ni contenu de logos.

## 3. Fichiers non fiables

- Détection du type réel par signature, pas par extension ni par type MIME déclaré.
- Taille maximale côté bot : 20 Mo (limite de téléchargement de l'API Bot standard) ; images redimensionnées avant envoi à RodiumAI (corps limité à 10 Mio).
- Dimensions maximales en pixels pour éviter les images « bombes ».
- SVG : peut contenir scripts et références externes. Il est nettoyé (suppression des scripts, des gestionnaires d'événements et des références externes) puis rastérisé sans accès réseau. Le fichier original est conservé tel quel mais jamais servi comme page.
- Aucun fichier utilisateur n'est exécuté ni interprété comme code.

## 4. Injection dans les prompts

- Les champs saisis (nom, secteur, public, positionnement) sont limités en longueur et traités comme des données, jamais comme des instructions.
- Les sorties des modèles sont validées par schémas (zod) avant usage ; toute sortie hors schéma est rejetée.
- Le texte lu dans le logo par le modèle de vision est traité comme non fiable.
- Aucun modèle ne reçoit d'outil capable d'agir (pas d'appel d'API, pas d'accès aux fichiers) : il produit seulement du JSON ou une image.

## 5. Données transmises à RodiumAI

Sont envoyés : le logo (redimensionné), les informations de marque saisies, les prompts. À documenter après lecture des pages Terms of Service, Privacy Policy et Trust & Security de RodiumAI (non vérifiées à ce jour) : conservation, entraînement des modèles, droits d'usage commercial des images générées, fournisseurs amont.

## 6. Conservation et suppression

- Fichiers temporaires et ZIP supprimés après 24 à 72 h (valeur configurable). Raison supplémentaire : quota de 1 Go.
- Liens signés avec expiration courte ; jamais de lien public permanent.
- Logo original conservé uniquement pendant la durée de rétention du projet, sauf demande contraire.
- Suppression d'un projet via /cancel ou commande d'administration.

## 7. Budget et abus

- Plafonds de dépense et de tentatives par projet (voir COSTS.md).
- Aucune opération coûteuse sans confirmation explicite de la propriétaire.
- Les erreurs 429 de RodiumAI sont traitées avec attente et limite de tentatives.

## 8. Contrôles réseau

- Les seules URL appelées sont des domaines configurés (RodiumAI, Supabase, Telegram). Aucune URL fournie par l'utilisatrice n'est téléchargée côté serveur.

## 9. Licences

- Polices : uniquement des polices à licence libre (par exemple OFL) pour pouvoir les incorporer dans le PDF et les images.
- Vercel Hobby : usage non commercial. Un usage commercial exige un autre plan ou hébergeur.

## 10. Tests de sécurité à écrire (phases suivantes)

Message d'un identifiant non autorisé ignoré ; jeton secret absent ou faux refusé ; doublon d'`update_id` sans second traitement ; fichier invalide ou SVG piégé rejeté ou neutralisé ; champ de texte contenant des instructions sans effet sur la charte ; dépassement de budget bloqué ; lien signé expiré inutilisable ; absence de secrets dans les journaux.
