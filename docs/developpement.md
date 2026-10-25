# Développement

## Organisation de `public/`

| Fichier | Contenu |
|---|---|
| `index.html` | Structure de la page (accueil, carnet, chronologie, carte) |
| `style.css` | Tous les styles |
| `data.js` | Données : époques et événements, systèmes de la carte, liaisons, positions |
| `timeline.js` | Chronologie et fond étoilé |
| `map.js` | Star Viewer (carte du temps), liens entre onglets, navigation |
| `carnet.js` | Carnet de bord (chronomètre, saisie, bilan, import Game.log) |
| `home.js` | Accueil (dernière activité), page des versions et enregistrement du service worker |
| `util.js` | Utilitaires partagés (`OrbUtil` : `# Développement

## Organisation de `public/`

| Fichier | Contenu |
|---|---|
| `index.html` | Structure de la page (accueil, carnet, chronologie, carte) |
| `style.css` | Tous les styles |
| `data.js` | Données : époques et événements, systèmes de la carte, liaisons, positions |
| `timeline.js` | Chronologie et fond étoilé |
| `map.js` | Star Viewer (carte du temps), liens entre onglets, navigation |
| `carnet.js` | Carnet de bord (chronomètre, saisie, bilan, import Game.log) |
| `home.js` | Accueil (dernière activité), page des versions et enregistrement du service worker |
, `esc`, `escRe`, `norm`), chargé en premier |
| `search.js`, `search.css` | Recherche globale (touche « / » ou loupe) : événements, systèmes, planètes, Comm-Links ; copie de lien |
| `versions.js` | Historique des versions (une entrée par commit) |
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

`npm test` lance sept séries : `tests/data.js` (cohérence des données), `tests/server.js` (serveur et API), `tests/smoke.js` (interface), `tests/search.js` (recherche globale), `tests/perf-fonts-sw.js` (polices locales, service worker hors ligne) `tests/perf-images.js` (images de la chronologie, Comm-Links) et `tests/features.js` (carnet : édition, chronomètre, exports, imports ; mobile ; clavier ; hors ligne). Les deux premières n’ouvrent pas de navigateur.

Le test lance le serveur, ouvre chaque onglet dans Chromium et vérifie la carte, les liens entre onglets, le carnet, l'API et l'authentification. Il échoue s'il y a une erreur dans la console. Avec un Chromium déjà installé : `CHROMIUM_PATH=/chemin/vers/chromium npm test`.

## Historique des versions

Chaque commit sur `dev` reçoit un numéro de version `1.x.x` et un commentaire, affichés dans l'onglet **Versions** de l'application (données dans `public/versions.js`). Les fusions de pull requests ne comptent pas.

```
npm run version -- minor "Titre" "Commentaire sur les modifications"   # nouvelle fonction : 1.9.0 → 1.10.0
npm run version -- patch "Titre" "Commentaire"                           # correction : 1.9.0 → 1.9.1
npm run version -- sync                                                  # renseigne le hash des commits déjà faits
```

La commande met à jour `public/versions.js`, `package.json` et `package-lock.json` ; le test (`npm test`) vérifie que la dernière entrée correspond à la version de `package.json`. Le hash d'une entrée est ajouté par `sync` au commit suivant, puisqu'il n'existe pas avant le commit.
