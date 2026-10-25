# Origine des images de la chronologie

- `evt-0-0` à `evt-0-4` : images fournies par le propriétaire du projet.
- `evt-1-0`, `evt-1-8`, `evt-3-0`, `evt-3-4`, `evt-4-7`, `evt-5-2`, `evt-6-0`, `evt-6-1`, `evt-7-1` : visuels officiels de [robertsspaceindustries.com](https://robertsspaceindustries.com) (Comm-Links), recadrés en 2,8 : 1. Ils appartiennent à Cloud Imperium Games : à retirer si le dépôt ou l'image Docker devient public.
- `evt-0-5`, `evt-0-6`, `evt-1-1`, `evt-1-6`, `evt-1-7`, `evt-2-3`, `evt-3-2`, `evt-4-3`, `evt-7-9` : photos de la NASA (domaine public, [images.nasa.gov](https://images.nasa.gov)), recadrées en 2,8 : 1. Détail ci-dessous.
- Les autres événements gardent l'illustration dessinée par le code (`visuals.js`). Les prompts utilisés sont dans `prompts-visuels.md`.

| Fichier | Événement | Source (Comm-Link RSI) |
|---|---|---|
| `evt-1-0` | Naissance de Roberts Space Industries | RSI Constellation Mk IV Celebration |
| `evt-1-8` | Nick Croshaw ouvre la voie | Q&A : MISC Hull B |
| `evt-3-0` | Rencontre avec les Banu | Banu Message |
| `evt-3-4` | L’Empire xi’an est découvert | Xi’an Transmission |
| `evt-4-7` | L’Aurora arrive | RSI Aurora Mk I Celebration |
| `evt-5-2` | Le siège de Tiber | Anvil Odin – The Allfather of War |
| `evt-6-0` | Drake Interplanetary | Drake Golem – For the Workers |
| `evt-6-1` | microTech est découverte | Race for Stanton : microTech |
| `evt-7-1` | Les Vanduul attaquent Squadron 42 | Squadron 42 Newsletter |

## Photos de la NASA

| Fichier | Événement | Photo | Page source |
|---|---|---|---|
| `evt-0-5` | Les Guerres spirituelles | Nébuleuse de la Carène (Hubble) | GSFC_20171208_Archive_e002076 |
| `evt-0-6` | Fin de l’Obscurité | Lever du soleil, limbe de la Terre (STS-52) | STS052-23-022 |
| `evt-1-1` | Le premier moteur quantique | Moteur ionique de Deep Space 1 | PIA04247 |
| `evt-1-6` | Le départ de l’Artemis | Lever de Terre vu d’Orion | art002e021278 |
| `evt-1-7` | Le Triangle de Neso | Nébuleuse de la Tête de cheval | GSFC_20171208_Archive_e001518 |
| `evt-2-3` | Naissance des Nations unies de la Terre | Terre vue de l’ISS (Alex Gerst) | iss040e062704 |
| `evt-3-2` | Premier regard sur Pyro | Éruption solaire du 31 août 2012 | GSFC_20171208_Archive_e001662 |
| `evt-4-3` | La bataille d’Idris IV | Limbe de la Terre et aurore (ISS) | iss058e005282 |
| `evt-7-9` | Début de la guerre vanduul | Terre de nuit (Reid Wiseman) | iss040e091231 |

Chaque page source se trouve sur `https://images.nasa.gov/details/<identifiant>`.

## Versions `-800` (chronologie)

Les fichiers `evt-<époque>-<n>-800.webp` (800 × 286, 7 à 29 Ko) sont **générés** par `node scripts/make-event-images.js` à partir des originaux 1600 × 571 (jamais modifiés) : ne pas les éditer à la main. Après avoir ajouté ou remplacé une image `evt-*.webp`, relancer le script (`--force` pour tout régénérer). `timeline.js` les charge via `srcset` ; `tests/perf-images.js` vérifie qu'il y en a une par image.

## Comm-Links

L’onglet Lore › Comm-Links affiche `public/commlinks.js`, généré par `node scripts/commlinks.js` (liste, titres, dates, extraits et vignettes viennent de robertsspaceindustries.com ; les images ne sont pas copiées, elles sont chargées depuis le site de RSI). Relancez la commande pour actualiser la liste.

La liste s'affiche par pages (12 cartes, puis « Voir plus » : +18). Les cartes demandent la variante « slideshow » (648 × 366, environ 40 % du poids) à la place de `channel_item_full` (1119 × 600) : remplacement de `channel_item_full` par `slideshow` dans l'URL, vérifié le 25 octobre 2026 sur les 4 041 URL d'images distinctes de `commlinks.js` (toutes répondent 200). L'original reste dans le `srcset` pour les écrans denses et sert de repli si la vignette échoue. Les autres noms essayés (`channel_item_small`, `thumb`, `thumbnail`, `post_section_small`, `slider_thumb`, `monitor_small`) n'existent pas ; `subscribers_vault_thumbnail` (216 × 133) et `heap_thumb` (61 × 61) existent mais sont trop petits pour des cartes de 376 px.

## Remplacements du 25 octobre 2026

`evt-7-2`, `evt-7-3`, `evt-7-4`, `evt-7-7` et `evt-7-12` : nouvelles images générées avec Canva (Magic Media), recadrées en 1600 × 571. À mentionner « généré par IA (Canva) » si le dépôt devient public (voir `docs/droits-images.md`).
