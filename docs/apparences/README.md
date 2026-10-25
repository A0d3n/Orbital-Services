# Apparences du Star Viewer (maquettes)

Trois maquettes autonomes (CSS + SVG inline). Affectations de camp et données fictives, à titre illustratif.

- **A. Fond étoilé** (`A-fond-etoile.html`) : étoiles en 3 couches et nébuleuse discrète, charte verte conservée.
  - Plus : ambiance, cohérent avec l'existant. Risque : étoiles qui concurrencent les liaisons fines ; contraste texte à surveiller sur les zones de nébuleuse.
  - Performance : bonne (motifs SVG répétés, aucun filtre).
- **B. Camps vifs** (`B-camps-vifs.html`) : couleurs saturées, halos, liaisons colorées par camp.
  - Plus : camps lisibles d'un coup d'œil, très "StarMap". Risque : flou (filtre) coûteux sur mobile avec beaucoup de systèmes ; jaune/vert/cyan vifs fatigants ; la couleur seule porte l'information (daltonisme).
- **C. Holo sobre** (`C-holo-sobre.html`) : traits fins, grille, accent vert sauge, camp indiqué par un petit anneau.
  - Plus : très léger, élégant, texte bien contrasté. Risque : camps moins immédiats, traits fins peu visibles au soleil ou sur petit écran.

**Recommandation** : C comme base (perf et contraste), avec les teintes de camp un peu plus lumineuses de B et un halo limité au système sélectionné ; étoiles de A en option très discrète. Ajouter une forme ou une lettre par camp pour ne pas dépendre de la couleur seule.
