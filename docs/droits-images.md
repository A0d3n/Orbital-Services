# Droits des images avant de rendre le dépôt public

Synthèse de recherche du 25 octobre 2026. **Ce n'est pas un avis juridique.** Certaines pages (Canva, Fan Kit RSI) n'ont pas pu être lues en entier : à vérifier sur les pages officielles.

Tant que le dépôt et l'image Docker restent **privés**, rien ne presse. Ces points comptent le jour où tu les publies.

## Par catégorie

| Catégorie | Fichiers | Risque | Action avant publication |
|---|---|---|---|
| Visuels de Comm-Links RSI | 9 (`evt-1-0`, `evt-1-8`, `evt-3-0`, `evt-3-4`, `evt-4-7`, `evt-5-2`, `evt-6-0`, `evt-6-1`, `evt-7-1`) | **Élevé** : les conditions d'utilisation de RSI interdisent de copier ou redistribuer ses contenus sans accord. Un dépôt ou une image Docker public = redistribution. | Les retirer (l'application retombe sur l'illustration dessinée par `visuals.js`), ou les remplacer par des visuels du Fan Kit RSI (accès avec compte). |
| Vignettes des Comm-Links | chargées depuis le site de RSI | Moyen : rien n'est stocké chez toi, mais l'application dépend des serveurs de RSI. Aucune règle explicite sur ce point n'a été trouvée. | Garder le chargement à distance, avec le lien vers l'article. |
| Images « style RSI » faites avec Canva | 41 | Moyen : Canva interdit de redistribuer ses éléments pris isolément ; il demande d'indiquer le contenu généré par IA ; il ne donne aucun droit sur les marques de RSI/CIG. | Vérifier qu'aucune image ne contient de logo ou de nom de marque ; ajouter « images générées par IA (Canva) » dans le README. |
| Photos NASA | 9 (voir `docs/images.md`) | Faible : domaine public en général, crédit demandé. Le logo NASA n'est pas libre ; certaines photos appartiennent à des tiers. | Vérifier chaque fiche sur images.nasa.gov ; garder la colonne « Page source » de `docs/images.md` comme crédits. |

## Autres points
- Le pied de page de l'application dit déjà « Projet de fan non officiel » et cite les marques de Cloud Imperium. Ajoute la même phrase au README.
- Supprimer un fichier d'un dépôt ne l'efface pas de l'historique git. Pour publier sans les 9 visuels RSI, il faut **un dépôt neuf** (ou une réécriture de l'historique), pas seulement un commit de suppression.
- Si tu envisages de la monétisation (dons, abonnement), demande d'abord à CIG : les règles correspondantes n'ont pas pu être lues.

## Sources
- RSI, Fan Kit et FAQ : https://support.robertsspaceindustries.com/hc/en-us/articles/360006895793-Star-Citizen-Fankit-and-Fandom-FAQ
- RSI, conditions d'utilisation : https://robertsspaceindustries.com/en/tos/1
- NASA, images et médias : https://www.nasa.gov/nasa-brand-center/images-and-media/
- Canva, licence de contenu : https://www.canva.com/policies/content-license-agreement/
