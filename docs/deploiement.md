# Déploiement

## Avec l'image Docker (recommandé)

L'image `ghcr.io/a0d3n/orbital-services` contient le serveur et la page. Il n'y a rien à copier sur le NAS, sauf le dossier des données.

1. Créez un dataset, par exemple `apps/orbital-services/data`, avec pour propriétaire l'utilisateur **apps** (UID 568) en lecture et écriture.
2. Apps → *Discover Apps* → **Custom App** (*Install via YAML*), collez `docker-compose.yml` après avoir remplacé `/mnt/POOL` par le nom de votre pool.
3. Ouvrez `http://IP-DU-NAS:9080`.

Si le paquet GitHub est privé, connectez-vous d'abord à `ghcr.io` avec un jeton personnel (`read:packages`), ou rendez le paquet public dans les réglages du dépôt.

## Mettre à jour

À chaque changement sur `dev`, GitHub Actions publie une nouvelle image `ghcr.io/a0d3n/orbital-services:dev` (onglet Actions du dépôt, workflow « Image Docker », il faut compter environ une minute). Le NAS ne la récupère pas tout seul : arrêtez puis redémarrez l'application. Avec `pull_policy: always` dans `docker-compose.yml`, le redémarrage télécharge la dernière image. Pour vérifier, le numéro de version est affiché en bas de la barre latérale (et dans l'onglet Versions).

Si l'application a été installée avec l'ancien compose (fichiers copiés dans `app/`), elle ne se met à jour qu'en recopiant les fichiers : remplacez-la par le `docker-compose.yml` actuel.

## Sans image publiée

`docker compose -f docker-compose.build.yml up -d --build` construit l'image sur la machine à partir des sources.

## Vérifier que ça marche

- `http://IP-DU-NAS:9080/healthz` répond `{"ok":true,...}`. Si la page est introuvable, la réponse est une erreur 503 qui indique le dossier cherché et son contenu, et la même information apparaît dans les journaux de l'application.
- Le message « introuvable » seul vient d'un fichier manquant dans `public/` (une image ou un script), pas d'un problème réseau.

## Réglages (variables d'environnement)

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port d'écoute dans le conteneur | `8080` |
| `DATA_DIR` | Dossier des données | `/data` |
| `AUTH_PASSWORD` | Active l'authentification de base si renseigné | vide (accès libre) |
| `AUTH_USER` | Identifiant demandé | `orbital` |
| `KEEP_BACKUPS` | Nombre de fichiers de sauvegarde (un par jour) conservés | `14` |
| `BACKUP_INTERVAL_MS` | Intervalle de la sauvegarde planifiée, en ms (minimum 50) | `3600000` (1 h) |
| `CSP_REPORT_ONLY` | `1` : la politique de sécurité (CSP) est envoyée en mode « rapport seulement » (`Content-Security-Policy-Report-Only`) : rien n'est bloqué, le navigateur signale seulement dans sa console | vide (CSP appliquée) |

## Sauvegardes

- Une sauvegarde est faite **au démarrage**, puis **toutes les heures uniquement si les données ont changé**, et une dernière à l'arrêt propre (SIGTERM) s'il reste des changements.
- Il y a un fichier par jour, `data/backups/entries-AAAA-MM-JJ.json`, réécrit de façon atomique (fichier temporaire, `fsync`, puis renommage) : il contient l'état le plus récent du jour. Les `KEEP_BACKUPS` derniers jours sont gardés.
- **Restaurer** : arrêtez l'application, remplacez `data/entries.json` par la copie voulue, puis redémarrez.
- **Attention : le dossier `backups` est dans le même volume que les données.** Si le dataset est perdu ou corrompu, les sauvegardes le sont aussi. Copiez-les régulièrement ailleurs que sur le NAS.

### Copier les sauvegardes hors du NAS

- Le plus simple : copier le dossier `backups` (ou `entries.json`) à la main ou par script vers un autre ordinateur ou un disque externe.
- Avec rsync, depuis une autre machine (adaptez l'utilisateur, l'adresse et les chemins) :
  `rsync -av --ignore-existing utilisateur@IP-DU-NAS:/mnt/POOL/apps/orbital-services/data/backups/ ~/sauvegardes/orbital/`
  (sans `--ignore-existing`, le fichier du jour est mis à jour à chaque passage.)
- Planifié dans TrueNAS : *Data Protection* → **Rsync Task** (vers un autre serveur en SSH) ou **Cloud Sync Task** (vers un stockage cloud), source `/mnt/POOL/apps/orbital-services/data/backups`, une exécution par jour. Une **Periodic Snapshot Task** du dataset est un complément utile, mais reste sur le même NAS.

## Conteneur durci

`docker-compose.yml` et `docker-compose.build.yml` démarrent le conteneur avec `read_only: true`, `tmpfs: [/tmp]`, `cap_drop: [ALL]` et `no-new-privileges`. Le serveur n'écrit que dans `DATA_DIR` (`/data`) : ce volume reste **inscriptible pour l'utilisateur 568** (propriétaire du dataset), le reste du système de fichiers est en lecture seule. Le contrôle de santé (`wget` vers `/healthz`) n'écrit rien et fonctionne en lecture seule. Si une version future a besoin d'écrire ailleurs, retirez `read_only: true` pour dépanner.

## En-têtes de sécurité

Toutes les réponses portent une `Content-Security-Policy` (scripts, styles, polices, connexions : uniquement le site lui-même ; images : le site, `data:` et robertsspaceindustries.com), une `Permissions-Policy`, `Cross-Origin-Resource-Policy: same-origin`, `nosniff`, `Referrer-Policy: no-referrer` et `X-Frame-Options`. Pas de COOP/COEP, pour ne pas casser l'ouverture de liens vers RSI. **Secours** : si une mise à jour affiche une page cassée à cause de la CSP, ajoutez `CSP_REPORT_ONLY: "1"` dans `environment` et redémarrez : la politique n'est plus appliquée, seulement signalée dans la console du navigateur.

## Authentification : limites et précautions

- **HTTPS obligatoire hors réseau local.** L'authentification de base fait circuler l'identifiant et le mot de passe en clair en HTTP. Gardez l'application sur votre réseau local, ou placez-la derrière un VPN ou un reverse proxy HTTPS.
- **Limitation des essais.** Après 5 échecs en 1 minute depuis la même adresse IP, le serveur répond `429 Too Many Requests` avec un en-tête `Retry-After` pendant 60 secondes (même avec le bon mot de passe). `/healthz` n'est jamais concerné. Derrière un reverse proxy, le serveur voit l'adresse du proxy : tous les visiteurs partagent alors le même compteur.
- **Avertissement au démarrage.** Si `AUTH_USER` est défini sans `AUTH_PASSWORD` (ou avec un mot de passe vide), l'accès n'est pas protégé et le journal affiche un avertissement.
- **API du carnet.** Les écritures (`PUT`) exigent `Content-Type: application/json` (sinon 415), sont limitées à 64 Ko (413) et refusées (403) si l'en-tête `Origin` ne correspond pas à l'hôte demandé.

## Cache hors ligne

Le service worker nomme son cache `orbital-<version>` (la version de `package.json`, écrite dans `public/sw.js` par `npm run version`). À chaque nouvelle version, l'ancien cache est supprimé et le nouveau se remplit au premier chargement. Le cache d'exécution est plafonné à 150 entrées, et `commlinks.js` (1,3 Mo) n'est pas précaché : il est gardé après la première visite de l'onglet Comm-Links.

## Données de marché UEX (optionnel)

Fonction **désactivée par défaut**. Une fois activée, le serveur (jamais le navigateur) interroge l'API publique d'UEX Corp (https://uexcorp.space) pour récupérer des prix, terminaux, raffineries, carburant et vaisseaux. Elle sert de base aux futurs outils de l'onglet Commerce (Prix, Routes, Raffineries, Carburant, Vaisseaux). Pour l'instant, l'onglet Commerce n'affiche que l'état de ces données (bloc « Données de marché »), avec le badge « Powered by UEX ».

### Activer

1. Dans `docker-compose.yml`, décommentez `UEX_ENABLED: "1"` (les autres variables sont facultatives).
2. Redémarrez l'application. Le journal indique « données de marché UEX activées ».
3. Ouvrez l'onglet **Commerce** : le bloc « Données de marché » affiche le badge et l'état de chaque ressource. Au début, toutes sont « pas encore récupérée » : **rien n'est téléchargé tant qu'un outil ne demande pas la ressource** (pas de préchauffage). Pour essayer à la main : `http://IP-DU-NAS:9080/api/uex/status` puis `http://IP-DU-NAS:9080/api/uex/commodities`.

Le conteneur doit pouvoir joindre `https://api.uexcorp.uk` (sortie HTTPS, DNS compris). Le mode `read_only: true` reste compatible : le cache est écrit dans le volume `/data` (`/data/uex-cache`).

### Variables

| Variable | Rôle | Défaut |
|---|---|---|
| `UEX_ENABLED` | `1` active la fonction ; toute autre valeur : aucune requête sortante, aucun dossier créé, `/api/uex/*` répond 404 | vide (désactivé) |
| `UEX_KEY` | Clé d'API UEX (Bearer), facultative (créée dans « My Apps » sur uexcorp.space). Jamais renvoyée au navigateur, ni écrite dans les journaux | vide |
| `UEX_BASE` | Adresse de l'API (change seulement pour des essais) | `https://api.uexcorp.uk/2.0` |
| `UEX_CACHE_DIR` | Dossier du cache sur disque. À garder dans `/data` | `DATA_DIR/uex-cache` |
| `UEX_MAX_PER_MINUTE` | Appels sortants par minute, tous types confondus (100 au maximum ; UEX en autorise 120) | `40` |
| `UEX_TTL_SCALE` | Multiplicateur des durées de validité du cache (`2` : deux fois plus longues, donc deux fois moins d'appels) | `1` |
| `UEX_TIMEOUT_MS` | Délai maximal d'un appel sortant | `20000` |

### Ce que ça fait

- **Appels sortants depuis le NAS** : un GET par ressource, sans paramètre, avec le `User-Agent` `OrbitalServices/<version> (+usage personnel)`. Liste fermée de 12 ressources (voir `docs/uex-api.md`).
- **Durées de validité (TTL)** : prix et carburant 30 min, marchandises 1 h, terminaux et vaisseaux 12 h, systèmes, raffineries et version du jeu 1 jour. Quand une ressource est périmée, le serveur répond tout de suite avec l'ancienne version (marquée `stale`) et la renouvelle en arrière-plan.
- **Quotas** : au plus `UEX_MAX_PER_MINUTE` appels par minute (file d'attente au-delà), un seul appel à la fois par ressource. En usage normal : quelques dizaines d'appels par jour au total.
- **Pannes** : si UEX ne répond pas, répond mal ou si le quota est atteint, l'ancien cache est conservé, une ligne courte est écrite dans le journal et le serveur attend de plus en plus longtemps (30 s, 1 min, 2 min… jusqu'à 1 h) avant de réessayer cette ressource. Sans aucun cache, l'API répond 503 `uex_unavailable`.
- **Authentification** : si `AUTH_PASSWORD` est défini, `/api/uex/*` est protégé comme le reste du site.

### Conditions d'UEX à respecter

- **Usage personnel et non commercial** uniquement. L'accès peut être restreint en cas d'abus : ne montez pas `UEX_MAX_PER_MINUTE` sans raison.
- **Attribution** : le badge « Powered by UEX » (lien vers https://uexcorp.space) doit rester affiché ; c'est le cas dans l'onglet Commerce.
- **Données communautaires** : saisies par des joueurs, elles peuvent être inexactes ou en retard. Aucune garantie.
- **L'API peut changer ou disparaître** sans préavis.
- **Ne pas redistribuer les données** : le cache n'est jamais dans git ni dans l'image Docker (`uex-cache` est dans le volume de données, hors des sauvegardes du carnet). Ne publiez pas le dossier `uex-cache`.

### Vider le cache

Arrêtez l'application, supprimez le contenu de `/mnt/POOL/apps/orbital-services/data/uex-cache/` (ou un seul fichier `<ressource>.json`), puis redémarrez. Les ressources supprimées seront récupérées de nouveau à la demande. Supprimer des fichiers pendant que l'application tourne n'a pas d'effet immédiat : le serveur garde aussi une copie en mémoire.

### Dépannage

- **Le bloc affiche « désactivées »** : `UEX_ENABLED` n'est pas à `"1"` (entre guillemets dans le YAML) ou l'application n'a pas été redémarrée.
- **« indisponible » avec `network` ou `timeout`** (visible dans `/api/uex/status`) : le conteneur n'a pas d'accès à Internet (pare-feu, DNS, réseau du conteneur). Essayez depuis le NAS : `docker exec orbital-services wget -qO- https://api.uexcorp.uk/2.0/game_versions`. Un proxy n'est pas géré.
- **`rate_limited` (HTTP 429) ou `denied`** : quota atteint ou accès restreint par UEX. Le serveur attend (jusqu'à 1 h) avant de réessayer ; baissez `UEX_MAX_PER_MINUTE` ou augmentez `UEX_TTL_SCALE`.
- **UEX en panne** : l'application continue de fonctionner. Les données déjà en cache restent servies (marquées « ancienne »), les autres fonctions (carnet, carte, simulateur) ne sont pas touchées.
- **Erreur d'écriture du cache** (`écriture du cache impossible`) : le dossier de données n'est pas inscriptible pour l'utilisateur 568 ; le cache reste alors seulement en mémoire.
