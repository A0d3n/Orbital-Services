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
| `KEEP_BACKUPS` | Nombre de sauvegardes quotidiennes conservées | `14` |

Les sauvegardes sont dans `data/backups/entries-AAAA-MM-JJ.json`. Pour restaurer, arrêtez l'application, remplacez `data/entries.json` par la copie voulue, puis redémarrez.

L'authentification passe en clair sur le réseau : gardez l'application sur votre réseau local, ou placez-la derrière un VPN ou un reverse proxy en HTTPS.
