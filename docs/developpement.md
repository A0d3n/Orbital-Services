# Développement

## Organisation de `public/`

| Fichier | Contenu |
|---|---|
| `index.html` | Structure de la page (accueil, carnet, chronologie, carte) |
| `style.css` | Tous les styles |
| `data.js` | Données : époques et événements, systèmes de la carte, liaisons, positions |
| `timeline.js` | Chronologie et fond étoilé |
| `map.js` | Carte du temps, liens entre onglets, navigation |
| `carnet.js` | Carnet de bord (chronomètre, saisie, bilan, import Game.log) |
| `home.js` | Accueil (dernière activité) et enregistrement du service worker |
| `sw.js` | Mode hors ligne |

Pour ajouter un système ou un événement, il suffit de modifier `data.js` : les chiffres de l'accueil (systèmes, époques, années) et les boutons « voir sur la carte » sont calculés à partir des données.

## Lancer en local

```
node server.js          # http://localhost:8080, données dans ./data
```

## Tests

```
npm install
npx playwright install chromium
npm test
```

Le test lance le serveur, ouvre chaque onglet dans Chromium et vérifie la carte, les liens entre onglets, le carnet, l'API et l'authentification. Il échoue s'il y a une erreur dans la console. Avec un Chromium déjà installé : `CHROMIUM_PATH=/chemin/vers/chromium npm test`.
