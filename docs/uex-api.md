# API UEX Corp 2.0 : notes d'intégration

Notes internes de la brique « données de marché » (`uex.js`). Elles décrivent ce qui a été **mesuré** le 26 octobre 2026 (une requête par ressource, sans clé, `User-Agent: OrbitalServices/1.32.1 (+usage personnel)`), pas une documentation officielle. Documentation d'UEX : https://uexcorp.space/api/documentation. Conditions : https://uexcorp.space/about/terms.

## Principes

- Base : `https://api.uexcorp.uk/2.0/{ressource}`, réponse `{"status":"ok","http_code":200,"data":[...],"message":""}`. En cas d'erreur : `status` différent de `ok` (`not_allowed`, `missing_...`, `error`) et `http_code` ≥ 400.
- Les GET publics répondent **sans clé**. Aucun en-tête `X-RateLimit-*` n'a été observé ; quotas annoncés : 120 requêtes par minute, 172 800 par jour. Nous plafonnons à 40 par minute par défaut (100 au maximum).
- Réponses compressées par UEX, avec `Cache-Control: public, max-age=<TTL>, must-revalidate` : c'est de là que viennent nos TTL.
- Conditions à respecter : usage personnel non commercial ; l'API peut changer ou disparaître ; aucune garantie d'exactitude (données saisies par des joueurs) ; accès restreignable en cas d'abus ; badge « Powered by UEX » demandé ; pas de règle claire de redistribution. **Donc : aucune donnée UEX dans le dépôt git ni dans l'image Docker.** Le cache vit uniquement dans `UEX_CACHE_DIR` (par défaut `/data/uex-cache`), et les tests utilisent des données inventées.
- Clé facultative (Bearer, créée dans « My Apps » chez UEX) : `UEX_KEY`. Envoyée seulement à l'amont (HTTPS, ou machine locale pour les essais), sans suivre de redirection ; jamais renvoyée au navigateur, ni journalisée, ni mise dans une erreur.

## Résultats du sondage (16 ressources candidates)

Taille = corps JSON décompressé. « Fraîcheur » = date de modification la plus récente d'une ligne (la médiane est plus ancienne : toutes les lignes ne bougent pas à chaque mise à jour).

| Ressource | HTTP | Clé ? | Paramètre obligatoire | Taille | Lignes | TTL annoncé | Fraîcheur (max) | Décision |
|---|---|---|---|---|---|---|---|---|
| `commodities_prices_all` | 200 | non | non | 1 068 040 o | 2 581 | 30 min | 26/10/2026 08:20 | **retenue**, TTL 30 min |
| `commodities` | 200 | non | non | 138 262 o | 205 | 1 h | 16/10/2026 | **retenue**, TTL 1 h |
| `terminals` | 200 | non | non | 1 072 504 o | 825 | 12 h | 08/10/2026 | **retenue**, TTL 12 h |
| `star_systems` | 200 | non | non | 27 060 o | 96 | 1 jour | 01/11/2025 | **retenue**, TTL 1 jour |
| `planets` | 200 | non | non | 103 089 o | 324 | 1 jour | 04/04/2026 | écartée (les libellés viennent de `terminals`, qui porte déjà `star_system_name`, `planet_name`…) |
| `space_stations` | 200 | non | non | 51 721 o | 60 | 1 jour | 04/04/2026 | écartée (idem ; utile pour une fiche lieu, étape ultérieure) |
| `vehicles` | 200 | non | non | 582 699 o | 283 | 12 h | 16/10/2026 | **retenue**, TTL 12 h (UEX annonce 12 h, pas 1 jour) |
| `vehicles_purchases_prices_all` | 200 | non | non | 52 771 o | 295 | 12 h | 20/10/2026 | **retenue**, TTL 12 h |
| `vehicles_rentals_prices_all` | 200 | non | non | 60 967 o | 337 | 12 h | 21/10/2026 | **retenue**, TTL 12 h |
| `fuel_prices_all` | 200 | non | non | 38 928 o | 196 | 30 min | 26/10/2026 06:55 | **retenue**, TTL 30 min |
| `refineries_methods` | 200 | non | non | 1 150 o | 9 | 1 jour | 11/10/2023 | **retenue**, TTL 1 jour |
| `refineries_yields` | 200 | non | non | 122 423 o | 215 | 1 jour | 24/10/2026 | **retenue**, TTL 1 jour |
| `refineries_capacities` | 200 | non | non | 10 523 o | 20 | 1 jour | 24/10/2026 | **retenue**, TTL 1 jour |
| `commodities_averages` | **403** | **oui** (`not_allowed`, « Authentication error ») | — | 94 o | — | 30 min | — | **exclue** : inaccessible sans clé, et inutile aux modules prévus |
| `commodities_raw_prices_all` | 200 | non | non | 79 552 o | 345 | 30 min | 20/10/2026 | écartée (minerais bruts ; hors des modules prévus) |
| `game_versions` | 200 | non | non | 85 o | objet | 1 jour | — | **retenue**, TTL 1 jour (version du jeu pour l'état) |

Remarques :
- Les 12 ressources retenues pèsent environ 3,2 Mo en tout (deux d'entre elles, prix et terminaux, dépassent 1 Mo). Au pire, un cycle complet représente 12 requêtes par jour pour les ressources à 1 jour, plus 48 par jour pour chaque ressource à 30 min : très loin des quotas.
- `game_versions` renvoie un **objet** (`{"live":"4.10.2","ptu":"4.10.3"}`), pas un tableau : `data` est servi tel quel.
- `commodities_routes` n'est pas appelée : les routes seront calculées localement à partir de `commodities_prices_all` (qui contient `price_buy`, `price_sell`, `scu_*`, `status_*`, `container_sizes`, `commodity_name`, `terminal_name`).
- `refineries_yields` et `refineries_capacities` : les dates récentes montrent que les données sont alimentées par les joueurs ; la liste des méthodes (`refineries_methods`) date de 2023 et change rarement.
- Les prix n'ont pas tous le même âge : `date_modified` par ligne permet à un futur module d'afficher « prix du … » et d'écarter les lignes trop anciennes.

## Champs utiles par ressource

| Ressource | Champs utiles |
|---|---|
| `commodities_prices_all` | `id_commodity`, `id_terminal`, `commodity_name`, `terminal_name`, `price_buy`, `price_buy_avg`, `price_sell`, `price_sell_avg`, `scu_buy`, `scu_sell`, `scu_sell_stock`, `status_buy`, `status_sell`, `container_sizes`, `date_modified` |
| `commodities` | `id`, `name`, `code`, `kind`, `weight_scu`, `price_buy`, `price_sell`, `is_illegal`, `is_raw`, `is_refined`, `is_buyable`, `is_sellable`, `is_available_live` |
| `terminals` | `id`, `name`, `fullname`, `displayname`, `type`, `star_system_name`, `planet_name`, `orbit_name`, `moon_name`, `space_station_name`, `city_name`, `max_container_size`, `is_refinery`, `is_cargo_center`, `is_refuel`, `game_version` (les champs `screenshot*` sont des URL chez UEX, jamais chargées par la page : CSP) |
| `star_systems` | `id`, `name`, `code`, `faction_name`, `is_available_live` |
| `fuel_prices_all` | `id_commodity`, `id_terminal`, `commodity_name`, `terminal_name`, `price_buy`, `price_buy_avg`, `date_modified` |
| `refineries_yields` | `id_commodity`, `id_terminal`, `commodity_name`, `terminal_name`, `star_system_name`, `value`, `value_week`, `value_month`, `date_modified` |
| `refineries_methods` | `id`, `name`, `code`, `rating_yield`, `rating_cost`, `rating_speed` |
| `refineries_capacities` | `id_terminal`, `terminal_name`, `star_system_name`, `value`, `value_week`, `value_month`, `date_modified` |
| `vehicles` | `id`, `name`, `name_full`, `company_name`, `scu`, `crew`, `mass`, `width`, `height`, `length`, `fuel_quantum`, `fuel_hydrogen`, `container_sizes`, `is_cargo`, `is_mining`, `is_spaceship`, `is_ground_vehicle`, `game_version` (les `url_*` ne sont pas utilisées) |
| `vehicles_purchases_prices_all` | `id_vehicle`, `id_terminal`, `vehicle_name`, `terminal_name`, `price_buy`, `date_modified` |
| `vehicles_rentals_prices_all` | `id_vehicle`, `id_terminal`, `vehicle_name`, `terminal_name`, `price_rent`, `date_modified` |
| `game_versions` | `live`, `ptu` |

## Prix : achat et vente (sémantique des champs de commodities_prices_all)

Établie le 26 octobre 2026 en croisant la documentation et les données publiques (ligne par terminal et par marchandise). **Point de vue du joueur** :

| Champ | Sens retenu |
|---|---|
| `price_buy` > 0 | le terminal **vend** la marchandise : le **joueur l'achète** ici, au prix `price_buy` aUEC par SCU (« Où acheter ») |
| `price_sell` > 0 | le terminal **achète** la marchandise : le **joueur la vend** ici, au prix `price_sell` (« Où vendre ») |
| `scu_buy` | stock disponible à l'achat (côté « Où acheter ») |
| `scu_sell` | demande (quantité que le terminal est prêt à acheter) (côté « Où vendre ») |
| `scu_sell_stock` | stock détenu par le terminal ; **non utilisé** (souvent non nul sur les terminaux qui achètent, parfois absurde) |
| `*_avg` | moyenne historique du champ correspondant (« average reported » pour `scu_sell_stock_avg`) ; 0 = absente |
| `status_buy` / `status_sell` | niveau d'inventaire 1 à 7 (`commodities_status`) ; non affichés pour l'instant |
| `date_modified` | horodatage en **secondes** (0 = inconnue) de la dernière saisie communautaire du terminal |

Un terminal peut avoir les deux prix, un seul, ou aucun (ligne ignorée). Sur l'ensemble mesuré (2 581 lignes) : 700 lignes avec `price_buy` seul, 1 881 avec `price_sell` seul, aucune avec les deux, aucune sans prix ; 81 marchandises sur 205 n'ont aucune ligne de prix. Le **code** d'une marchandise n'est pas unique (ex. « Agricium » et « Agricium (Ore) » portent `AGRI`) : les liens `#commerce/prix?m=` utilisent le **slug** (`agricium`), le code n'étant accepté qu'en secours (premier résultat qui a des prix).

Sources :
- Documentation des champs : https://uexcorp.space/api/documentation/id/get_commodities_prices_all/ (ne décrit que « last » pour `price_buy`, `price_sell`, `scu_buy`, `scu_sell_stock`, et « average reported » pour `scu_sell_stock_avg` ; elle ne dit pas qui achète à qui).
- Fiche publique https://uexcorp.space/commodities/info/name/agricium (vue d'ensemble) : « Offer (6) » et « Demand (27) » ; « Buy — Best » = 6 840 UEC à Endgame et 500 SCU à Shubin SMCa-6 ; « Sell — Best » = 11 000 UEC à Rod's Fuel 'N Supplies et 1 394 SCU à ARC-L3 ; l'onglet **Buy** pointe vers `locations_selling` et l'onglet **Sell** vers `locations_buying`. Recoupé avec l'API : les 6 terminaux avec `price_buy` > 0 sont exactement les 6 de « Offer », Endgame a `price_buy` 6 840, Shubin SMCa-6 `scu_buy` 500, Rod's Fuel `price_sell` 11 000, ARC-L3 `scu_sell` 1 394. Le meilleur prix d'achat est donc le plus bas `price_buy`, le meilleur prix de vente le plus haut `price_sell`.
- Les tests (`tests/market.js`, données fabriquées dans `tests/market-fixtures.js`) couvrent : terminal qui vend seulement, qui achète seulement, les deux, aucun.

Côté client (`public/market.js`) : un jeu de données = un index en mémoire construit une fois (marchandise → lignes « acheter » / « vendre »), rendu limité à 200 lignes par tableau avec « Voir plus » ; fraîcheur d'une ligne = âge de `date_modified` (Frais ≤ 1 h, À vérifier ≤ 24 h, Périmé au-delà, « Date inconnue » si 0, classée avec les périmés) ; valeurs à 0 ou absentes affichées « — ».

À noter pour `/api/uex/<ressource>` (brique serveur, non modifiée) : l'ETag ne dépend que du contenu et un **304 ne porte ni `age_s` ni `stale`** ; le client calcule l'âge de son côté et, pour une ressource qu'il sait périmée, redemande **une fois, sans ETag**, 10 s plus tard.

## Liste blanche finale (code : `RESOURCES` dans `uex.js`)

Ressource | TTL | Module prévu
---|---|---
`commodities_prices_all` | 30 min | Prix, Routes
`commodities` | 1 h | Prix, Routes
`terminals` | 12 h | Prix, Routes, libellés
`star_systems` | 1 jour | libellés
`fuel_prices_all` | 30 min | Carburant
`refineries_yields` | 1 jour | Raffineries
`refineries_methods` | 1 jour | Raffineries
`refineries_capacities` | 1 jour | Raffineries
`vehicles` | 12 h | Vaisseaux
`vehicles_purchases_prices_all` | 12 h | Vaisseaux
`vehicles_rentals_prices_all` | 12 h | Vaisseaux
`game_versions` | 1 jour | état (version du jeu)

Toute autre ressource répond 404. Les TTL sont multipliés par `UEX_TTL_SCALE`. Ajouter une ressource = ajouter une ligne dans `RESOURCES` (après vérification qu'elle est publique, sans paramètre obligatoire, et en mettant à jour ce document et les tests).

## Routes de notre serveur

- `GET /api/uex/status` : `{status, enabled, active, attribution, game_version, resources:[{resource, ttl_s, fetched_at, age_s, state, size, error, retry_in_s}], last_error:{resource, code, at}, limits}`. N'appelle jamais UEX. `state` : `ok` (âge ≤ TTL), `stale` (périmé, contenu gardé), `error` (rien en cache, dernier essai échoué), `absent` (jamais demandée). Désactivé : `{enabled:false, ...}`.
- `GET /api/uex/<ressource>` : `{status:"ok", resource, fetched_at, age_s, stale, attribution, data}`. La query string est ignorée. `ETag` = empreinte du contenu en cache, `If-None-Match` → 304. Corps en gzip si le navigateur l'accepte. Sans cache et en échec : 503 `{"error":"uex_unavailable"}` (avec `Retry-After` pendant le backoff). Désactivé : 404 `{"error":"uex_disabled"}`. Ressource inconnue : 404 `{"error":"uex_unknown_resource"}`. Méthodes autorisées : GET et HEAD (405 sinon). L'authentification de base (`AUTH_PASSWORD`) s'applique comme ailleurs.
- Codes d'erreur (seuls mots écrits dans les journaux et dans `status`) : `timeout`, `network`, `http_<code>`, `denied` (401/403), `rate_limited` (429), `invalid_json`, `upstream_status` (`status` ≠ `ok`), `invalid_data`, `too_big` (> 12 Mo).

## Comportement du cache

- Mémoire + disque (`<UEX_CACHE_DIR>/<ressource>.json`, écriture atomique : `.tmp`, `fsync`, renommage). Au démarrage le cache disque valide est rechargé ; **aucune récupération** tant qu'un client ne demande pas la ressource (pas de préchauffage).
- Périmé : réponse immédiate avec `stale:true` et rafraîchissement en arrière-plan. Rien en cache : le client attend la récupération (au plus `UEX_TIMEOUT_MS` + 2 s).
- Un seul rafraîchissement à la fois par ressource ; au plus 3 appels sortants simultanés ; limiteur global `UEX_MAX_PER_MINUTE` (file d'attente).
- Échec : l'ancien cache est gardé, une ligne courte est journalisée (`uex : <ressource> indisponible (<code>), nouvel essai dans N s`), puis attente de 30 s, 1 min, 2 min… jusqu'à 1 h (`Retry-After` de l'amont respecté, dans la limite d'une heure). Un succès remet le compteur à zéro.

## Réglages pour les tests ou le dépannage

`UEX_WINDOW_MS` (fenêtre du limiteur, 60000 par défaut, 100 minimum), `UEX_BACKOFF_BASE_MS` (30000) et `UEX_BACKOFF_MAX_MS` (3600000). Ils servent aux tests ; il n'y a pas de raison de les changer en usage normal.

## Points à surveiller

- UEX peut changer un nom de champ ou retirer une ressource sans préavis : les futurs modules doivent lire les champs de façon défensive.
- Le format d'erreur n'est pas uniforme (`not_allowed` pour un 403) : nous ne regardons que `status === "ok"`.
- `commodities_averages` pourrait être ajoutée plus tard si une clé est fournie ; elle n'est pas dans la liste blanche car aucun module prévu n'en a besoin et nous n'avons pas pu vérifier son format sans clé.
