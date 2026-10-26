# Directions artistiques – Orbital Services
Trois maquettes autonomes (HTML + CSS + SVG + JS inline, sans dépendance). Sélecteur d'écrans en haut de page (hors maquette). Police : pile `"Nunito", "Segoe UI", system-ui, sans-serif` ; Nunito (licence OFL) serait hébergée en local à l'intégration. Toutes les données sont des exemples fictifs.

- **A – Terminal clair** (`A-clair.html`) : clair par défaut, barre supérieure en carte flottante avec menu à icônes, bascule sombre (suit `prefers-color-scheme`).
- **B – Sombre doux** (`B-sombre-doux.html`) : notre sombre actuel, adouci : cartes très arrondies à relief, rail d'icônes à gauche, bascule clair.
- **C – Hybride** (`C-hybride.html`) : barre latérale et en-tête sombres, contenu clair en cartes plus nettes, tableaux denses avec jauges de ROI, carte sur fond sombre, mode kiosk plein écran.

**Repris de l'esprit UEX** : cartes arrondies à ombre douce, champs et boutons « en relief », pastilles de filtres, colonnes de tableau teintées (investi en orange, net en vert, ROI en bleu), valeurs abrégées (info-bulle = valeur exacte), fil d'Ariane, indice en en-tête, ton chaleureux.
**Volontairement différent** : ni logo, ni textes, ni bannières, ni icônes UEX ; vert plus profond (#0b6b43 en clair, #6fd69f en sombre) ; contrastes mesurés (texte >= 4,5:1, composants >= 3:1) ; perte toujours écrite et fléchée, jamais en couleur seule ; camps de la carte distingués par la forme.

| | Effort d'intégration | Lisibilité | Identité Star Citizen | Performance |
|---|---|---|---|---|
| A | Moyen : tout le CSS actuel (sombre) à repasser en variables clair/sombre | Excellente, la plus proche d'UEX | Faible (neutre) | Très bonne |
| B | Faible : jetons de couleur et rayons à changer, structure conservée | Bonne ; relief et dégradés à doser en plein jour | Forte (ambiance cockpit) | Bonne (dégradés, ombres) |
| C | Élevé : deux zones de thème (chrome sombre fixe + contenu), barre latérale à créer | Excellente pour les données denses | Moyenne à forte | Bonne |

**Recommandation** : A comme direction principale (clair par défaut, sombre cohérent), en reprenant de B le rail d'icônes et l'ambiance sombre, et de C la carte sur fond sombre et les jauges. Risques : sur A, un clair par défaut s'éloigne de l'ambiance actuelle ; sur C, deux thèmes à maintenir. Maquettes non testées dans un navigateur : à vérifier à 390 et 1440 px.
