# Journal de trades et simulateur : 3 maquettes (étape 1)

Maquettes HTML autonomes, 100 % locales, données d'exemple fictives (« Marchandise A », « Lieu A → Lieu B »). Boutons de démo en haut de chaque page.

- **A-formulaire.html** : le simulateur est une section « Détail du trade » du formulaire « Nouvelle entrée », visible quand « Commerce / cargo » est choisi ; le gain / perte est rempli automatiquement.
  Avantages : un seul endroit, découvrable dès qu'on saisit un cargo, aucun nouvel écran. Risques : formulaire long sur mobile (le résultat est sous les champs), « Juste simuler » est un peu caché.
- **B-page-commerce.html** : un onglet « Commerce » à côté de « Carnet », avec simulateur à gauche, journal des trades et statistiques à droite.
  Avantages : le plus lisible sur grand écran, de la place pour les statistiques. Risques : un nouvel onglet à créer (état, routage, accessibilité), moins découvrable depuis le formulaire, deux journaux à synchroniser.
- **C-tiroir.html** : formulaire inchangé, bouton « Calculer un trade » qui ouvre un volet (latéral ou bas) et préremplit le formulaire ; badge « Trade » et filtre « Commerce » dans le journal.
  Avantages : formulaire existant presque intact, bon sur mobile, résultat toujours visible. Risques : composant dialogue à écrire (focus piégé, Échap), deux étapes pour enregistrer.

**Recommandation : A**, avec le résumé de résultat gardé visible sur mobile. C'est le chemin le plus court dans le carnet existant (une section et quelques champs dans le même formulaire, mêmes données `trade` dans l'entrée). B peut venir plus tard si les statistiques grossissent.
