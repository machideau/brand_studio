# Coûts

Principe : infrastructure à 0 $, seul poste variable : les crédits RODI. Les tarifs exacts en RODI ne sont pas connus à ce stade : ils se lisent avec `GET /v1/pricing` et `GET /v1/models` (clé requise) et se saisissent dans un fichier de configuration, jamais en dur dans le code.

## Infrastructure gratuite et seuils

| Poste | Gratuit | Seuil qui devient bloquant |
|---|---|---|
| Vercel Hobby | oui, usage non commercial | 4 heures de CPU actif par mois ; 300 s par fonction ; usage commercial interdit |
| Supabase | oui | 1 Go de fichiers ; 500 Mo de base ; pause après 7 jours sans activité |
| Inngest | oui | 50 000 exécutions par mois |
| Telegram | oui | 50 Mo par fichier |

Estimation à valider par mesure (hypothèse, non vérifiée) : si un pack consomme environ 60 s de CPU actif (sharp, PDF, ZIP), 4 heures de CPU actif permettent environ 240 packs par mois. Mesurer en phase 5 et 7.

Estimation Inngest (hypothèse) : environ 40 étapes par projet donnent environ 1 000 projets par mois dans la limite gratuite.

## Coût IA : modèle de calcul

Coût d'un pack = somme sur les images générées de (prix unitaire du modèle en RODI) x (nombre de tentatives) + coût des appels LLM/vision.

À titre d'ordre de grandeur uniquement (prix publics hors RodiumAI, relevés en 2026, susceptibles d'avoir changé) : une image coûte de l'ordre de quelques centimes à environ 0,25 $ selon le modèle et la résolution. RodiumAI applique ses propres tarifs en RODI : ne pas utiliser ces chiffres pour budgéter.

Hypothèse de travail à confirmer : un pack MVP demande 5 à 10 images IA (fonds et scènes), la typographie et le logo étant composés par code, ce qui réduit fortement le nombre de générations.

## Garde-fous

- Plafond de dépense par projet (valeur configurable).
- Nombre maximal de générations par projet et nombre maximal de nouvelles tentatives.
- Estimation du coût affichée avant la confirmation de la commande.
- Arrêt avant toute opération coûteuse si le budget est dépassé.
- Aucune relance automatique d'une génération déjà réussie (idempotence).
- Consultation périodique du solde avec `GET /v1/wallet`.

## Suivi (table `cost_records`)

Fournisseur, modèle, opération, nombre de jetons, nombre d'images, résolution, coût déclaré (si fourni), coût estimé (marqué comme estimation), nombre de tentatives, identifiant de projet. Une estimation n'est jamais présentée comme une facturation exacte.

## Coûts futurs possibles

Vercel Pro 20 $/mois si usage commercial ; Supabase Pro 25 $/mois si on dépasse les quotas ou si on veut des sauvegardes et pas de pause. Non nécessaires pour l'instant.
