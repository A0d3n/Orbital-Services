# Développement

## Organisation de `public/`

| Fichier | Contenu |
|---|---|
| `index.html` | Structure de la page (accueil, carnet, chronologie, carte) |
| `style.css` | Tous les styles |
| `data.js` | Données : époques et événements, systèmes de la carte, liaisons, positions |
| `timeline.js` | Chronologie et fond étoilé |
| `map.js` | Star Viewer (carte du temps), liens entre onglets, navigation |
| `carnet.js` | Carnet de bord (chronomètre, saisie, bilan, import Game.log, journal, exports CSV/JSON) |
| `trade.js`, `trade.css` | Journal de trades et simulateur : calculs (investissement, recettes, net, marge, ROI, bénéfice par heure), nettoyage de l’objet `trade`, tiroir « Calculer un trade » (volet latéral ≥ 700 px, volet bas en dessous), statistiques « Commerce » ; chargé avant `carnet.js` |
| `commerce.js`, `commerce.css` | Onglet « Commerce » (`#commerce`) en sous-onglets ARIA (`#commerce`, `#commerce/prix`, `#commerce/routes` ; Raffineries, Carburant, Vaisseaux « bientôt », désactivés ; hash inconnu = défaut ; routage appelé par `map.js` via `window.__orbCommerce(hash, evenement)`). Page par défaut « Simulateur & journal » : cartes-outils (simulateur, prix et routes actifs, trois outils « bientôt »), résumé des 30 derniers jours et cinq derniers trades. Lit les entrées du carnet via `window.OrbLog` (exposé par `carnet.js` : `all()`, `addTrade()`, `sync()`, `showType()`, événement `lg:update`) et ouvre le tiroir de `trade.js` avec l’action finale « Ajouter au journal » (enregistrement direct d’une entrée « cargo »). Chargé après `carnet.js` |
| `market.js`, `market.css` | Briques communes des modules de marché (`window.OrbMarket`) : client de données `/api/uex/<ressource>` (requêtes en vol dédoublonnées, cache mémoire, revalidation par ETag, délai de 30 s, au plus une requête par ressource et par ouverture), formats français et valeurs abrégées, tri stable, export CSV (BOM, `;`, CRLF, formules neutralisées), tableaux qui deviennent des cartes sous 700 px, bandeau de fraîcheur « Powered by UEX » ; et le module **Prix** (`#commerce/prix?m=<slug>`). Chargé avant `commerce.js` |
| `routes.js` | Module **Routes** (`#commerce/routes`, `window.OrbMarket.routes`) : routes calculées localement à partir de `commodities_prices_all`, `commodities`, `terminals`, `star_systems` (jamais `commodities_routes`) ; filtres (budget, SCU, marchandise, systèmes, marge, fraîcheur, légal, ignorer stock/demande), adresse partageable (`?b=&s=&m=&de=&vers=&roi=&f=&l=1&x=1`), tableau triable (100 routes puis « Voir plus »), cartes sous 700 px, CSV, bouton « Simuler ce trade » (tiroir prérempli via `window.__orbCommerceSim` de `commerce.js`). Règle de stock/demande et formules : `docs/uex-api.md`. Les identifiants et classes du module commencent par `rc` (le préfixe `rt` appartient à l’itinéraire du Star Viewer). Chargé après `market.js` |
| `home.js` | Accueil (dernière activité), page des versions et enregistrement du service worker |
| `util.js` | Utilitaires partagés (`OrbUtil` : `$`, `$$`, `esc`, `escRe`, `norm`), chargé en premier |
| `route.js`, `route.css` | Itinéraire entre deux systèmes du Star Viewer (plus court chemin en sauts à l’année affichée, tracé, lien `?de=&vers=`) |
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

`npm test` lance douze séries : `tests/data.js` (cohérence des données), `tests/server.js` (serveur et API), `tests/uex.js` (brique UEX avec faux serveur, sans navigateur ni Internet), `tests/smoke.js` (interface), `tests/search.js` (recherche globale), `tests/perf-fonts-sw.js` (polices locales, service worker hors ligne), `tests/perf-images.js` (images de la chronologie, Comm-Links), `tests/features.js` (carnet : édition, chronomètre, exports, imports ; mobile ; clavier ; hors ligne) `tests/trade.js` (journal de trades : calculs exacts, tiroir, ajout au carnet, journal, statistiques Commerce, exports, imports, stockage local, CSP) et `tests/market.js` (sous-onglets, états des données, module Prix : sémantique achat/vente, fraîcheur, recherche, filtres, tri, CSV, mobile, requêtes ; faux serveur UEX local et données fabriquées de `tests/market-fixtures.js`). `tests/routes.js` couvre le module Routes (calculs contrôlés par une implémentation indépendante, filtres, saisies invalides, adresse, tri, « Voir plus », CSV exact, « Simuler ce trade » et journal, états, mobile, requêtes, accessibilité, performance ; `ROUTES_SHOTS=<dossier>` enregistre des captures, `ROUTES_ONLY=<regex>` limite les sections). `tests/commerce.js` couvre l’onglet Commerce : navigation latérale et barre du bas à 5 entrées, cartes « bientôt » non interactives, état vide, ajout via le tiroir (« Ajouter au journal »), résumé 30 jours et cinq derniers trades, mise à jour depuis le carnet, volet bas à 390 px, absence de requêtes inutiles, CSP. Les deux premières n’ouvrent pas de navigateur.

Le test lance le serveur, ouvre chaque onglet dans Chromium et vérifie la carte, les liens entre onglets, le carnet, l'API et l'authentification. Il échoue s'il y a une erreur dans la console. Avec un Chromium déjà installé : `CHROMIUM_PATH=/chemin/vers/chromium npm test`.

## Historique des versions

Chaque commit sur `dev` reçoit un numéro de version `1.x.x` et un commentaire, affichés dans l'onglet **Versions** de l'application (données dans `public/versions.js`). Les fusions de pull requests ne comptent pas.

```
npm run version -- minor "Titre" "Commentaire sur les modifications"   # nouvelle fonction : 1.9.0 → 1.10.0
npm run version -- patch "Titre" "Commentaire"                           # correction : 1.9.0 → 1.9.1
npm run version -- sync                                                  # renseigne le hash des commits déjà faits
```

La commande met à jour `public/versions.js`, `package.json` et `package-lock.json` ; le test (`npm test`) vérifie que la dernière entrée correspond à la version de `package.json`. Le hash d'une entrée est ajouté par `sync` au commit suivant, puisqu'il n'existe pas avant le commit.

## Données de marché UEX (optionnel)

`uex.js` (racine, copié par le Dockerfile) est branché dans `server.js`. Désactivé par défaut (`UEX_ENABLED=1` pour l'activer) : le navigateur ne parle qu'à notre serveur, qui met en cache (mémoire + disque, dossier `DATA_DIR/uex-cache`, jamais dans git ni dans l'image) les ressources publiques d'UEX de sa liste blanche et les sert sous `/api/uex/<ressource>` ; `/api/uex/status` décrit l'état sans jamais appeler UEX. Détails, TTL et résultats du sondage : `docs/uex-api.md` ; activation, conditions d'usage et dépannage : `docs/deploiement.md`. Les tests (`tests/uex.js`) utilisent un faux serveur UEX local : aucun accès Internet.
