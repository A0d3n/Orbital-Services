# Développement

## Organisation de `public/`

| Fichier | Contenu |
|---|---|
| `index.html` | Structure de la page (accueil, chronologie, carte, Comm-Links, versions ; carnet masqué par défaut) |
| `style.css` | Tous les styles |
| `data.js` | Données : époques et événements, systèmes de la carte, liaisons, positions |
| `timeline.js` | Chronologie et fond étoilé |
| `map.js` | Star Viewer (carte du temps), liens entre onglets, navigation |
| `carnet.js` | Carnet de bord (chronomètre, saisie, bilan, import Game.log) |
| `home.js` | Accueil, page des versions, enregistrement du service worker ; charge `carnet.js` seulement si le carnet est activé |
| `util.js` | Utilitaires partagés (`OrbUtil` : `$`, `$$`, `esc`, `escRe`, `norm`, `carnet`), chargé dans `<head>` |
| `route.js`, `route.css` | Itinéraire entre deux systèmes du Star Viewer (plus court chemin en sauts à l’année affichée, tracé, lien `?de=&vers=`) |
| `search.js`, `search.css` | Recherche globale (touche « / » ou loupe) : événements, systèmes, planètes, Comm-Links ; copie de lien |
| `versions.js` | Historique des versions (une entrée par commit) |
| `sw.js` | Mode hors ligne |

Pour ajouter un système ou un événement, il suffit de modifier `data.js` : les chiffres de l'accueil (systèmes, époques, années) et les boutons « voir sur la carte » sont calculés à partir des données.

## Carnet de bord masqué

Le carnet de bord n'apparaît plus pour les visiteurs : ni dans la navigation (barre latérale, barre du bas sur mobile), ni sur l'accueil, ni dans la recherche. `#carnet` renvoie à l'accueil. Le code et les données sont conservés : `carnet.js`, l'API `/api/entries`, les sauvegardes et `data/entries.json` ne sont ni modifiés ni supprimés, et les entrées déjà enregistrées reviennent telles quelles à la réactivation.

Pour le réactiver (par navigateur) :

- ouvrir `https://votre-site/?carnet=1` : la valeur est mémorisée dans `localStorage["orbital-carnet"]` ;
- ou, dans la console du navigateur : `localStorage.setItem("orbital-carnet","1")` puis recharger ;
- pour le masquer de nouveau : `?carnet=0` (efface la valeur).

Fonctionnement : `util.js`, chargé dans `<head>`, calcule l'état avant le premier rendu et pose `data-carnet="1"` sur `<html>` s'il est activé (`OrbUtil.carnet`). Chaque élément du carnet porte `data-feature="carnet"` et la règle `html:not([data-carnet]) [data-feature="carnet"]{display:none!important}` le retire de l'affichage, du clavier et des lecteurs d'écran ; `data-feature="no-carnet"` marque au contraire le texte de remplacement affiché quand il est masqué. Désactivé, `home.js` ne charge pas `carnet.js` : pas de sondage de `/api/entries`, pas de lecture du stockage. Les tests (`tests/smoke.js`, `tests/features.js`) activent le carnet avec `localStorage.setItem("orbital-carnet","1")` et vérifient aussi le mode par défaut.

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

`npm test` lance sept séries : `tests/data.js` (cohérence des données), `tests/server.js` (serveur et API), `tests/smoke.js` (interface), `tests/search.js` (recherche globale), `tests/perf-fonts-sw.js` (polices locales, service worker hors ligne) `tests/perf-images.js` (images de la chronologie, Comm-Links) et `tests/features.js` (carnet : édition, chronomètre, exports, imports ; mobile ; clavier ; hors ligne). Les deux premières n’ouvrent pas de navigateur. Le carnet étant masqué par défaut, `smoke`, `features` et `perf-fonts-sw` l’activent avant de naviguer (`localStorage.setItem("orbital-carnet","1")`) ; `smoke` vérifie aussi le mode par défaut (navigation, accueil, `#carnet`, recherche, absence de requête vers `/api/entries`, barre du bas à 3 boutons, `?carnet=1` et `?carnet=0`).

Le test lance le serveur, ouvre chaque onglet dans Chromium et vérifie la carte, les liens entre onglets, le carnet, l'API et l'authentification. Il échoue s'il y a une erreur dans la console. Avec un Chromium déjà installé : `CHROMIUM_PATH=/chemin/vers/chromium npm test`.

## Historique des versions

Chaque commit sur `dev` reçoit un numéro de version `1.x.x` et un commentaire, affichés dans l'onglet **Versions** de l'application (données dans `public/versions.js`). Les fusions de pull requests ne comptent pas.

```
npm run version -- minor "Titre" "Commentaire sur les modifications"   # nouvelle fonction : 1.9.0 → 1.10.0
npm run version -- patch "Titre" "Commentaire"                           # correction : 1.9.0 → 1.9.1
npm run version -- sync                                                  # renseigne le hash des commits déjà faits
```

La commande met à jour `public/versions.js`, `package.json` et `package-lock.json` ; le test (`npm test`) vérifie que la dernière entrée correspond à la version de `package.json`. Le hash d'une entrée est ajouté par `sync` au commit suivant, puisqu'il n'existe pas avant le commit.
