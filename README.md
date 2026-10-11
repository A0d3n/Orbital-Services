# Orbital Services — déploiement sur TrueNAS

Contenu du dossier :

| Fichier | Rôle |
|---|---|
| `public/index.html` | La page complète (chronologie, carte du temps, carnet de bord) |
| `public/` (logos) | `logo.svg`, `logo-wordmark.svg`, PNG 32/180/192/512, `site.webmanifest` |
| `server.js` | Mini-serveur Node (sans dépendance) : sert la page et enregistre le carnet dans `data/entries.json` |
| `docker-compose.yml` | Définition de l'application pour TrueNAS |

Aucune image à construire : l'application utilise l'image officielle `node:22-alpine` et lit ces fichiers depuis un dataset.

## Installation (TrueNAS SCALE 24.10 « Electric Eel » ou plus récent)

1. **Créer le dataset.** Stockage → votre pool → *Ajouter un dataset* : `apps/orbital-services` (type « Apps » si proposé).
   Créez-y deux sous-dossiers : `app` et `data`.
2. **Droits.** Sur le dataset `orbital-services` (et sous-dossiers) : propriétaire utilisateur **apps** (UID 568) et groupe **apps** (GID 568), en lecture/écriture. Sans cela, le carnet ne pourra pas écrire.
3. **Copier les fichiers.** Dans `app/` : `server.js` et le dossier `public/` (avec tout son contenu). Via un partage SMB sur le dataset, ou `scp -r server.js public/ admin@IP-DU-NAS:/mnt/POOL/apps/orbital-services/app/`. Laissez `data/` vide.
4. **Créer l'application.** Apps → *Discover Apps* → **Custom App** (ou « Install via YAML ») → collez le contenu de `docker-compose.yml` après avoir remplacé `/mnt/POOL` par le nom réel de votre pool (deux endroits). Validez.
5. **Ouvrir** `http://IP-DU-NAS:9080` (changez le port `9080` si besoin). L'onglet Carnet de bord doit indiquer « Enregistré sur le serveur ».

## Sauvegarde et mise à jour

- Les données du carnet sont dans `data/entries.json` : incluez le dataset dans vos snapshots / tâches de réplication.
- Pour mettre à jour la page : remplacez `public/index.html`, puis redémarrez l'application depuis l'interface Apps.
- Vous pouvez aussi exporter le carnet en CSV ou JSON depuis l'onglet, et réimporter le JSON.

## Bon à savoir

- **Pas d'authentification** : toute personne qui atteint le port peut lire et modifier le carnet. Gardez-le sur votre réseau local ; pour un accès à distance, passez par un VPN (WireGuard, Tailscale) plutôt que d'ouvrir le port sur Internet. Un reverse proxy avec authentification (Nginx Proxy Manager, Authelia…) convient aussi.
- **Polices** : la page charge Roboto depuis Google Fonts. Sans accès Internet côté navigateur, elle s'affiche avec une police de secours (Helvetica / Arial).
- **Import du Game.log** : il se fait depuis votre PC de jeu (sélection du fichier dans le navigateur) ; le NAS n'a pas besoin d'accéder au jeu.
- Sans le serveur (page ouverte directement ou hébergée sur un simple serveur de fichiers), le carnet fonctionne quand même, mais ses données restent dans le navigateur.
- Port d'écoute interne : variable `PORT` (8080 par défaut). Vérification : `http://IP-DU-NAS:9080/healthz`.
- Non testé sur un NAS réel : le serveur et la page ont été vérifiés en local ; les réglages propres à TrueNAS (droits, chemins) sont à confirmer chez vous.
