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

## Routes : stock, demande et formules (module `#commerce/routes`, lot 2)

Routes calculées **localement** (`public/routes.js`) : pour chaque marchandise, toutes les paires (terminal où le joueur achète : `price_buy` > 0) × (terminal où il vend : `price_sell` > 0), terminaux différents, bénéfice par SCU > 0. `commodities_routes` n'est pas appelée. Distance et durée : non fournies par les ressources de la liste blanche, donc absentes.

Formules : bénéfice/SCU = vente − achat ; SCU utilisés = min(SCU saisis, ⌊budget ÷ achat⌋ si budget, stock à l'achat, demande à la vente) ; investissement = achat × SCU ; revenu = vente × SCU ; bénéfice total = revenu − investissement ; ROI = (vente − achat) ÷ achat. Une route à moins d'un SCU utilisable est écartée. Fraîcheur : le plus ancien des deux `date_modified` (≤ 1 h, ≤ 24 h ou tout ; date inconnue = seulement « tout »). Tri par défaut : bénéfice total décroissant, puis nom de marchandise et de terminaux.

**Règle prudente pour le stock (`scu_buy`) et la demande (`scu_sell`)**, car 0 peut signifier « inconnu » ou « épuisé » :
- quantité > 0 : elle limite les SCU (partie entière) ;
- quantité 0 et état d'inventaire qui confirme l'absence : `status_buy` = 1 (« Out of Stock ») à l'achat, `status_sell` = 7 (« Maximum Inventory (No Demand) ») à la vente : route **écartée** ;
- quantité 0 sans cet état (état absent ou autre) : **inconnue**, ne limite pas, et la ligne l'indique (« stock inconnu », « demande inconnue ») ;
- case « Ignorer le stock et la demande » : aucune limite ni exclusion.
Source des états : ressource `commodities_status` d'UEX (https://uexcorp.space/api/documentation/id/get_commodities_status/ ; interrogée une fois le 26 octobre 2026, **hors liste blanche**, donc non appelée par l'application) : côté achat 1 = Out of Stock (0-14 %), 2 Very Low, 3 Low, 4 Medium, 5 High, 6 Very High, 7 Maximum (86-100 %) ; côté vente les mêmes niveaux de 1 à 7, le 7 s'appelant « Maximum Inventory (No Demand) ». La documentation de `commodities_prices_all` ne définit pas ces états ; la règle repose donc sur cette ressource.
Limites : les quantités sont des saisies de joueurs, souvent anciennes ; un stock inconnu peut être réellement vide ; la demande réelle varie à chaque vente ; aucune promesse de précision (avertissement permanent dans l'interface). Le champ `is_illegal` de `commodities` alimente le filtre « légales uniquement » (désactivé s'il n'est pas fourni).

Adresse : `#commerce/routes?b=<budget>&s=<SCU, défaut 100>&m=<slug>&de=<système de départ>&vers=<système d'arrivée>&roi=<marge %>&f=<1h|24h|tout, défaut 24h>&l=1&x=1` (valeurs par défaut omises).

## Raffineries : sens des données (module `#commerce/raffineries`, lot 3)

Établi le 26 octobre 2026 : lecture de la documentation d'UEX, de sa page publique, puis **un seul appel par ressource** à l'API publique (sans clé, rien stocké dans le dépôt). Les chiffres ci-dessous décrivent cet échantillon (215 lignes de rendement) ; ils servent à choisir l'échelle et les textes, pas à les figer.

Sources :
- https://uexcorp.space/api/documentation/id/get_refineries_yields/ : « Retrieve a list of all refineries yields bonuses per commodity » ; `value` = « percentage of yield bonus at refinery », `value_week` = « … (last 7 days) », `value_month` = « … (last 30 days) » ; entiers ; mise à jour « Monthly (at least) » ; 500 lignes au plus.
- https://uexcorp.space/api/documentation/id/get_refineries_methods/ : « Retrieves the refining methods used by all in-game refineries » ; `rating_yield` « 1 low | 2 medium | 3 high », `rating_cost` « 1 low | 2 medium | 3 high », `rating_speed` « 1 slow | 2 medium | 3 fast » ; mise à jour « Patch cycle ».
- https://uexcorp.space/api/documentation/id/get_refineries_capacities/ : « estimated capacity percentages for all refineries » ; `value` / `value_week` / `value_month` y sont décrits comme « yield bonus percentage » (texte copié des rendements : la documentation est incohérente avec les valeurs, voir plus bas).
- Page publique https://uexcorp.space/mining/refineries : « Shows all refineries and their respective commodities yields and workloads (averages) » ; note de bas de tableau : « * Values in percentage. Averages of the last 30 days. » ; colonnes : raffinerie, système, **Workload** (icône d'engrenage), une colonne par minerai (code à quatre lettres, 19 minerais), **Last Update** (icône d'horloge).

### Rendements (`refineries_yields`)

| Question | Réponse établie |
|---|---|
| Que représente `value` ? | Un **bonus de rendement relatif, en %, signé** : positif = bonus, négatif = malus. Ce n'est ni un rendement absolu (« 60 % du minerai ») ni un profit. **La base de calcul n'est pas définie par UEX** : l'interface écrit « bonus de rendement relatif, définition d'UEX ». |
| Entre quoi et quoi ? | Entiers de **−9 à +13** (215 lignes) ; premier quartile −4, **médiane +1**, troisième quartile +4 ; aucun zéro dans l'échantillon (les cases sans ligne sont vides, pas à 0). Répartition : −9 (1), −8 (12), −6 (9), −5 (29), −4 (16), −3 (15), −2 (15), −1 (4), +1 (18), +2 (28), +3 (4), +4 (11), +5 (5), +6 (4), +7 (12), +8 (20), +9 (7), +10 (1), +11 (2), +12 (1), +13 (1). |
| `value`, `value_week`, `value_month` | **Identiques pour les 215 lignes** au moment de l'échantillon (aucune ligne où l'un diffère d'un autre). L'interface propose quand même « Dernier / 7 jours / 30 jours » (défaut 30 jours, ce que montre la page d'UEX), désactive un champ absent des données et signale « identiques » quand c'est le cas. |
| Propre à quoi ? | À un couple **(terminal de raffinerie × marchandise)** : 215 couples distincts, aucune ligne en double ; aucun champ de méthode dans la ressource. **Le rendement ne dépend pas de la méthode de raffinage** telle qu'UEX le fournit (aucun lien entre `refineries_yields` et `refineries_methods`). |
| Combien de raffineries / de minerais ? | 20 terminaux de raffinerie (8 à 24 minerais chacun ; Levski en a 24, les autres 8 à 11) ; 24 marchandises (1 à 19 raffineries chacune). Systèmes : Stanton (114 lignes), Pyro (55), Nyx (46). |
| Fraîcheur | `date_modified` en secondes, par ligne : du 16/10/2026 16:00 UTC au 24/10/2026 08:15 UTC, médiane 20/10/2026 13:01 UTC (soit 2 à 10 jours pour une consultation le 26/10). `date_added` existe aussi. Le TTL d'un jour de notre cache ne dit donc rien de l'âge de chaque donnée. |

Contrôle croisé avec la page publique : pour Checkmate, les 11 cases non vides (AGRI −8, ALUM −4, BEXA −2, BORA +1, COPP −5, CORU −5, GOLD −3, IRON −5, LARA +2, QUAN +2, TUNG +4) sont exactement les `value_month` de l'API ; les cases vides de la page sont les couples sans ligne.

### Raffineries et minerais (`terminals`, `commodities`)

- **Raffinerie = terminal dont `type` vaut `refinery`** : 20 terminaux, exactement les 20 de `refineries_yields` et de `refineries_capacities`. Le drapeau `is_refinery` n'est **pas fiable** : 53 terminaux le portent (boutiques, « Refinery Ore Sales », « Admin »…) et 3 vraies raffineries l'ont à 0 (Checkmate, Orbituary, Processing - Stanton Gateway (Pyro)). Le module retient donc les terminaux de type `refinery` **et** tout terminal présent dans les rendements ou les capacités. Libellé : `nickname` (« Levski », « Stanton Gateway (Nyx) »), à défaut `displayname`, à défaut le nom sans le préfixe « Refinement Center - ». Système : `star_system_name` du terminal.
- **Minerai** : marchandise avec `is_refinable` = 1 (32 marchandises) **ou** présente dans les rendements (24). Les 24 des rendements ont `is_raw` = 1 et `is_refined` = 0 ; 22 sont `is_extractable` = 1 (les deux « Construction Material » ne le sont pas) ; 23 sont `is_refinable` (Ice (Raw) ne l'est pas) ; 9 marchandises `is_refinable` n'ont encore aucun rendement (Diamond, Stileron, Riccite, Cobalt, Jaclium, Aslarite, Ouratite, Construction Material Pebbles, Construction Pieces). `is_mineral` est **incohérent** (Lindinium, Savrilium, Torite à 0) et `is_raw` trop large (45 marchandises) : ils ne servent pas de critère. D'où le filtre par défaut « seulement les minerais avec au moins une donnée » (case à cocher pour voir aussi les autres).

### Méthodes (`refineries_methods`)

9 lignes (`id`, `name`, `code`, `rating_yield`, `rating_cost`, `rating_speed`, `date_added`). Les trois notes sont des **niveaux entiers de 1 à 3** (aucune autre valeur dans l'échantillon) : rendement faible / moyen / élevé ; coût faible / moyen / élevé (3 = le plus cher) ; vitesse lente / moyenne / rapide. Exemples : Cormack COR (1, 2, 3), Dinyx Solventation DIN (3, 1, 1), Pyrometric Chromalysis PYR (3, 3, 1). **Pas de `date_modified`** (seulement `date_added`, 11/10/2023) : aucune pastille de fraîcheur pour les méthodes, une note « liste de référence ». Aucun lien avec un terminal ni avec les rendements : le module ne combine rien et le dit.

### Capacités (`refineries_capacities`)

20 lignes, **une par terminal** (les mêmes 20 raffineries). `value` = **pourcentage de charge**, appelé « Workload » sur la page publique (le « Workload » de Checkmate, 95 %, est sa `value` ; 1 075 pour Levski s'affiche « 1K% »). Entiers de **4 à 1 075** : premier quartile 18, **médiane 63**, troisième quartile 192 ; `value_week` et `value_month` identiques à `value` (20 lignes sur 20) ; `date_modified` du 16/10 au 24/10/2026. Ce n'est **ni une quantité de SCU ni une durée** : aucune unité, aucun maximum. Sa signification exacte (file d'attente relative à une capacité ? plus c'est haut, mieux ou pire ?) **n'est pas définie par UEX** : le module l'affiche telle quelle (« Charge (workload) », en %), précise que la définition n'est pas donnée, et **ne l'utilise jamais pour classer**. La colonne « Last Update » de la page publique est la date de dernière mise à jour (« 2d », « 6d »), **pas une durée de traitement** ; aucune ressource ne fournit de durée de traitement.

### Échelle et règles retenues par le module

- **Échelle de couleur** : la maquette proposait 65 % / 50 % (idée du designer) ; **les données ne la justifient pas** (bonus signés de −9 à +13). L'échelle est dérivée des valeurs réelles du champ choisi : tri croissant s[0..n−1], seuil bas = s[⌈n/3⌉−1], seuil haut = s[⌊2n/3⌋] (terciles de **toutes** les cellules, indépendamment des filtres, pour que les couleurs ne bougent pas quand on filtre). **Élevé ▲** si v ≥ seuil haut et v > seuil bas ; **Faible ▼** si v ≤ seuil bas et v < seuil haut ; **Moyen ●** sinon. Avec les 215 valeurs à 30 jours : seuil bas −3, seuil haut +2, soit Faible ≤ −3 % (82 cases), Moyen de −2 % à +1 % (37), Élevé ≥ +2 % (96) : les égalités rendent les tiers inégaux. Les seuils exacts s'affichent dans la légende ; chaque niveau est écrit (symbole + mot), la couleur n'est qu'un renfort.
- **★ Meilleure** : plus haute valeur de la ligne parmi les raffineries affichées (filtre Système compris), s'il y a au moins deux valeurs ; toutes les cases à égalité la portent (« ex æquo »).
- **Classement « Meilleure raffinerie pour… »** : valeur décroissante, puis donnée la plus récente (`date_modified`, inconnue en dernier), puis ordre alphabétique de la raffinerie (collation française).
- **Fraîcheur par donnée** : mêmes trois états et mêmes symboles que le module Prix (Frais ● / À vérifier ◐ / Périmé ○ ; « Date inconnue » si `date_modified` vaut 0), mais **seuils adaptés à des données mises à jour au moins une fois par mois** : Frais ≤ 7 jours, À vérifier ≤ 30 jours, Périmé au-delà (les seuils du module Prix, 1 h / 24 h, rendraient tout « Périmé »). Le bandeau du haut reste celui du lot 1 (âge de la ressource et de sa dernière récupération).
- **CSV** : une ligne par minerai × raffinerie ayant une valeur (cases vides omises), dans l'ordre de la matrice affichée, filtres compris : minerai, code, raffinerie, système, valeur affichée (Dernier / 7 jours / 30 jours), valeur choisie, les trois valeurs, niveau, « meilleure de la ligne », charge, mise à jour (UTC), ancienneté (jours), fraîcheur. « ; », BOM, CRLF, virgule décimale, formules neutralisées (apostrophe devant =, +, -, @ pour les textes ; les nombres négatifs restent numériques).
- **Adresse** : `#commerce/raffineries?v=<dernier|7j|30j>&s=<système>&q=<recherche>&tous=1&m=<minerai du classement>&lt=<tri des minerais>&ct=<tri des raffineries>` (`lt` : `nom`, `best`, `n` ou `r<id terminal>`, préfixe `-` = décroissant ; `ct` : `sys`, `nom`, `avg`, `n` ; valeurs par défaut omises).
- **Requêtes** : six ressources (`refineries_yields`, `commodities`, `terminals`, `star_systems` indispensables ; `refineries_methods` et `refineries_capacities` facultatives : si elles manquent, le module reste utilisable et l'écrit), au plus une requête par ressource et par ouverture.
- **Points restés incertains** (affichés comme tels) : base de calcul du bonus de rendement ; sens (mieux ou moins bien) et unité de la charge ; `value_week` et `value_month` sont aujourd'hui des copies de `value` (UEX pourrait les différencier plus tard) ; la combinaison méthode × raffinerie n'existe pas dans les données.
