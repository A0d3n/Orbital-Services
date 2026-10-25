# Polices

- Geist (400 à 700) et Geist Mono (400 à 500) sont hébergées dans `public/` (le serveur ne sert pas les sous-dossiers) : aucune requête vers Google Fonts, l'application fonctionne hors ligne dès la première visite.
- Quatre fichiers woff2 (latin et latin-ext, polices variables, environ 84 Ko en tout) ; les `@font-face` sont en tête de `style.css`, avec `font-display: swap` et `unicode-range`. La page précharge `geist-latin.woff2`.
- Le cyrillique, le vietnamien et les symboles de Geist Mono ne sont pas inclus (les flèches « → » utilisent la police du système, comme avant).
- Licence : SIL Open Font License 1.1, auteurs « The Geist Project Authors » (Vercel) ; texte dans `public/fonts-LICENSE.txt`.
- Pour mettre à jour : télécharger les woff2 depuis `https://github.com/vercel/geist-font` ou Google Fonts et remplacer les fichiers.
