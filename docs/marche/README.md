# Commerce : modules de marché (données UEX), 3 navigations

**Option A retenue ; lot 1 : cadre + Prix livrés le 26 octobre 2026.** Sous-onglets #commerce / #commerce/prix ; Routes, Raffineries, Carburant et Vaisseaux sont « bientôt » (désactivés) et viendront dans des lots suivants. Les maquettes B et C sont conservées pour mémoire.

Maquettes autonomes (aucune dépendance), valeurs FICTIVES étiquetées « exemple ». Une barre « hors maquette » en haut change d'écran (5 modules) et d'état (OK, anciennes, indisponible, désactivé, chargement, vide). À tester à 390 et 1440 px.

- **A-sous-onglets.html** : barre Prix · Routes · Raffineries · Carburant · Vaisseaux au-dessus d'un panneau unique, état dans l'URL (#commerce/prix). Mobile : barre défilante, un seul écran à la fois. Découvrabilité : bonne (tout visible d'un coup d'œil). Effort : faible, il suffit de remplacer le contenu du panneau.
- **B-pages.html** : chaque module est une page avec fil d'Ariane et « Retour aux cartes » ; les cartes du tableau de bord deviennent des liens. Mobile : très lisible, une page = un sujet. Découvrabilité : excellente (les cartes existantes font office de menu). Risque : un clic de plus pour changer de module. Effort : moyen (routage et retours).
- **C-filtres-communs.html** : une page « Marché », filtres communs système/marchandise, 5 sections repliables. Mobile : long défilement, filtres communs à rappeler. Découvrabilité : moyenne (sections fermées). Risque : couplage des filtres entre sections, état d'ouverture à gérer. Effort : le plus élevé.
- Routes : le bouton « Simuler ce trade » ouvre le tiroir existant de trade.css, préremplis (marchandise, achat à, vente à, SCU, prix) mais modifiables, sans rien enregistrer avant validation ; Escape ou « Fermer » rend le focus au bouton.
- Vaisseaux : « Utiliser dans le carnet » renseigne le champ « Vaisseau » du carnet (aperçu dans la fiche).

**Recommandation : B.** Elle réutilise les 6 cartes déjà en place, reste simple à 390 px et laisse chaque module évoluer seul ; A reste un bon plan de repli si l'on veut passer d'un module à l'autre sans repasser par les cartes.
