# Journal de trades et simulateur : 3 maquettes (étape 1)

Maquettes HTML autonomes, 100 % locales, données d'exemple fictives (« Marchandise A », « Lieu A → Lieu B »). Boutons de démo en haut de chaque page.

- **A-formulaire.html** : le simulateur est une section « Détail du trade » du formulaire « Nouvelle entrée », visible quand « Commerce / cargo » est choisi ; le gain / perte est rempli automatiquement.
  Avantages : un seul endroit, découvrable dès qu'on saisit un cargo, aucun nouvel écran. Risques : formulaire long sur mobile (le résultat est sous les champs), « Juste simuler » est un peu caché.
- **B-page-commerce.html** : un onglet « Commerce » à côté de « Carnet », avec simulateur à gauche, journal des trades et statistiques à droite.
  Avantages : le plus lisible sur grand écran, de la place pour les statistiques. Risques : un nouvel onglet à créer (état, routage, accessibilité), moins découvrable depuis le formulaire, deux journaux à synchroniser.
- **C-tiroir.html** : formulaire inchangé, bouton « Calculer un trade » qui ouvre un volet (latéral ou bas) et préremplit le formulaire ; badge « Trade » et filtre « Commerce » dans le journal.
  Avantages : formulaire existant presque intact, bon sur mobile, résultat toujours visible. Risques : composant dialogue à écrire (focus piégé, Échap), deux étapes pour enregistrer.

**Implémentée le 26 octobre 2026 : option C (tiroir)**, sur décision du propriétaire (carnet de bord gardé tel quel). Code : `public/trade.js`, `public/trade.css`, intégration dans `carnet.js`, validation dans `server.js`, tests dans `tests/trade.js`.

Format stocké dans une entrée `cargo` (facultatif) : `trade: { cm, scu, buy, sell, fees, from, to }`, soit marchandise (≤ 80 car.), SCU (entier 1 à 10 000 000), prix d’achat et de vente par SCU (entiers 0 à 100 000 000 aUEC), frais (entier 0 à 10^12 aUEC, 0 si absent), lieux d’achat et de vente (≤ 80 car.). Le champ `auec` de l’entrée est le net calculé : scu × vente − scu × achat − frais. Un trade invalide ou sur une entrée qui n’est pas du cargo est ignoré (l’entrée est gardée).

**Recommandation initiale : A**, avec le résumé de résultat gardé visible sur mobile. C'est le chemin le plus court dans le carnet existant (une section et quelques champs dans le même formulaire, mêmes données `trade` dans l'entrée). B peut venir plus tard si les statistiques grossissent.
