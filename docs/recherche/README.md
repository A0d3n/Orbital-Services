# Recherche globale : 3 maquettes

Ouvrir chaque fichier dans un navigateur (elles s'ouvrent avec des résultats ; ajouter `#q=xyz` à l'adresse pour voir l'état vide). Données : extraits réels de `public/data.js` et `public/commlinks.js`.

- **A-palette.html** : palette centrée type « Ctrl+K » ouverte par « / » ou la loupe, résultats groupés par type, Entrée ouvre, Ctrl+Entrée copie le lien.
  - Pour : le plus rapide au clavier, un seul geste, bonne place pour les extraits surlignés. Combobox + listbox simples pour un lecteur d'écran.
  - Risques : recouvre l'écran sur mobile (clavier virtuel qui mange la liste), pas d'aperçu avant d'ouvrir ; pas de filtre par type.
- **B-panneau.html** : panneau latéral à droite avec puces de filtre (Événements, Systèmes, Comm-Links) et aperçu du résultat sélectionné avec « Ouvrir » et « Copier le lien ».
  - Pour : le plus clair pour explorer et partager (on voit ce qu'on copie), le contexte de la page reste visible sur grand écran.
  - Risques : le plus lourd à construire et à rendre accessible (piège à focus, puces, zone d'aperçu annoncée) ; sur mobile il devient plein écran et l'aperçu réduit la liste.
- **C-barre-haute.html** : champ toujours visible en haut, menu déroulant de résultats, petit bouton « Copier le lien » à droite.
  - Pour : découvrable sans connaître « / », pas d'overlay, modèle ARIA combobox le plus standard.
  - Risques : occupe de la hauteur en permanence sur mobile (avec la barre d'onglets en bas) ; le menu est court, le bouton copie dépend de la sélection.

**Recommandation** : A (palette) sur grand écran et mobile, avec la loupe visible dans l'en-tête pour la découverte ; l'aperçu de B peut s'y ajouter plus tard. Les résultats partagés s'ouvrent via une adresse de type `#/ev/ouverture-de-stanton`.
