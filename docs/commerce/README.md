# Section « Commerce » : 3 maquettes (étape 2)

Maquettes HTML autonomes, sans dépendance, données d'exemple fictives. Nouvelle navigation (sans « Carnet de bord ») : barre latérale Accueil · Lore · Commerce · Versions · À propos ; barre du bas mobile à 4 entrées. Le tiroir de simulation est celui de `docs/trades/C-tiroir.html`. Boutons de démo en haut de chaque page.

- **A-onglets.html** : une page « Commerce » avec six onglets (Simulateur & journal actif, cinq autres « bientôt »), journal filtrable, statistiques et exports CSV / JSON.
  Avantages : l'extensibilité se voit tout de suite, un onglet par futur outil, bon motif ARIA. Risques : barre d'onglets défilante sur mobile (onglets cachés à droite), doublon avec les sous-entrées de la barre latérale.
- **B-tableau-de-bord.html** : un accueil de section en cartes-outils (une active, cinq « bientôt ») avec résumé 30 jours et derniers trades.
  Avantages : le plus lisible pour découvrir les outils, très bon sur mobile. Risques : une page de plus avant le journal, qui n'a pas d'écran complet ici (filtres et exports à prévoir ailleurs).
- **C-barre-outils.html** : « tableau d'abord », barre d'outils (recherche, Calculer un trade, menu Outils), tableau triable, statistiques repliables, export CSV.
  Avantages : la page la plus directe et la plus compacte, le menu Outils s'allonge sans changer la page. Risques : les outils futurs ne sont que des lignes de menu, tableau à neuf colonnes remplacé par des cartes sous 1180 px.

**Recommandation : A.** Les onglets annoncent clairement les futurs outils, gardent le journal complet (filtres, stats, exports) et s'étendent en ajoutant un onglet et un panneau. Si les futurs outils deviennent nombreux, ajouter la page d'accueil de B devant (A + B combinés).

**Implémentée le 26 octobre 2026 (option B)** : onglet « Commerce » (`#commerce`, entre « Carnet de bord » et « Lore », barre du bas à 5 entrées) avec la structure de la maquette B dans la charte actuelle du site. Le Carnet de bord reste en place ; le tiroir de simulation est le même, avec l’action « Ajouter au journal » qui enregistre directement une entrée « cargo ». Voir `public/commerce.js`, `public/commerce.css` et `tests/commerce.js`.
