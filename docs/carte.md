# Vérification de la carte du temps avec la StarMap de RSI

Comparaison faite le 12 octobre 2026 avec les données de la StarMap officielle (`https://robertsspaceindustries.com/api/starmap/bootup` : 90 systèmes, 135 points de saut, six camps).

## Ce qui a été corrigé

- **29 systèmes manquants ajoutés** (la carte en avait 61, la StarMap en compte 90). Les dates de découverte viennent des Galactic Guide de RSI (et du wiki Star Citizen pour Tyrol et Genesis) :

  | Système | Découverte | Source |
  |---|---|---|
  | Goss | 2563 | Galactic Guide |
  | Tyrol | 2823 (Damon Huerta) | wiki Star Citizen |
  | Garron | 2784 (éclaireurs impériaux) | Galactic Guide |
  | T.āl | 2789 (révélé par les Xi’an après le traité de paix) | Galactic Guide |
  | Osiris | vers 2790 (« fin des années 2700 », date approximative) | Galactic Guide |
  | Kellog | 2811 (Patek Coen) | Galactic Guide |
  | Genesis | 2812 | wiki Star Citizen |
  | Oso | 2861 (Errol Navis) | Galactic Guide |
  | Chronos | 2863 | Galactic Guide |
  | Branaugh | 2877 (Desmond Fell) | Galactic Guide |
  | Ail’ka | 2915 (invitation des Xi’an) | Galactic Guide |
  | Kallis | 2921 | Galactic Guide |
  | Kabal | 2941 (Usuni Colo) | Galactic Guide |
  | Tamsa | 2943 (Kofi Baféuma) | StarMap |

  Quinze systèmes n’avaient pas de date publiée (14 aujourd’hui : Vanguard a reçu 2943, source communautaire) : Bacchus et Kins (les sources se contredisent), K.ap’a’ri, Malkail, El’sin (« données incomplètes ») et dix systèmes vanduul classés secret défense (Virgo, Viking, Volt, Vesper, Vanguard, Veritas, Vagabond, Voodoo, Vermilion, Vendetta). Ils apparaissent sur la carte en 2956, leur fiche indique « Date de découverte non précisée » et ils n’ont pas d’entrée dans le fil des événements.
- **Liaisons** : 72 points de saut de la StarMap ajoutés (par exemple Nyx–Pyro, Terra–Magnus, Terra–Goss). La liaison Terra–Virgil n’existe pas dans la StarMap (Virgil ouvre sur Nyx, Vega, Tiber, Oberon et Kellog) : elle est retirée. Ferron–Oretani est conservée, car le saut s’est effondré en 2485.
- **Positions** : la carte suit déjà la disposition de la StarMap à quelques dizaines de pixels près. Huit systèmes qui s’en écartaient de plus de 90 pixels ont été replacés d’après leurs coordonnées RSI : Banshee, Gliese, Yulin, Leir, Magnus, Stanton, Tayac et Castra.
- **Histoire et camps** :
  - Hadur, Pallas et Indra passent au camp xi’an en 2793 : le pacte de la ligne Perry, ratifié le 5 juillet 2793 à la suite de l’accord de paix Akari-Kray de 2789, partage les huit systèmes entre l’UEE et l’Empire xi’an ; Hadur, Pallas et Indra reviennent aux Xi’an (la StarMap les classe xi’an). Les frontières des « systèmes de transition » restent ouvertes au voyage et au commerce (voir `docs/lore-verifie.md`).
  - La chute de Caliban est datée de 2884 (et non 2871) ; le système passe au camp vanduul.
  - Nexus : l’UEE reprend le système en 2931, après la course de Dean Kellar (sources : Galactapedia et Galactic Guide Nexus de RSI).

## Ce qui reste différent, volontairement

- Plusieurs systèmes que la StarMap classe « non revendiqués » (Nul, Leir, Cathcart, Hades, Taranis, Nyx, Tanga, Oberon) restent au camp de l’humanité, car des humains y vivent.
- Les noms humains sont conservés pour les systèmes xi’ans (Hadur plutôt que Yā’mon).

## Apparence : Star Viewer

L’onglet s’appelle désormais **Star Viewer**. Il reprend l’allure de la StarMap de RSI tout en gardant la charte de l’application : carte plein cadre sur fond à grille de points, panneaux aux coins coupés (filtres à gauche, fiche du système à droite), console du temps flottante en bas, repères en anneaux marqués d’un point et liaisons fines vert sauge. Sous 1 100 px de large, les panneaux passent sous la carte.

## Recherche de dates pour les 15 systèmes sans date (25 octobre 2026)

Résultat : **aucune date officielle** n'a été trouvée. La StarMap et la Galactic Guide de RSI n'ont pas pu être relues pour ces systèmes ; les fiches du wiki starcitizen.tools donnent au mieux des fourchettes. Aucune donnée de `data.js` n'a donc été changée.

| Système | Ce que disent les sources | Décision proposée |
|---|---|---|
| Bacchus | wiki : « entre 2449 et 2530 » ; une version « 2439 » circule mais n'a pas pu être vérifiée | garder « non précisée » |
| Kins | wiki : « entre 2509 et 2542 » | garder « non précisée » |
| K.ap’a’ri, Malkail, El’sin | wiki : « entre 2530 et 2945 » (même valeur pour les trois, sans explication) | garder « non précisée » |
| Vesper, Vagabond, Voodoo, Vendetta, Virgo, Volt, Veritas, Vermilion | wiki : « entre 2726 et 2945 » (même valeur pour les huit) | garder « non précisée » |
| Vanguard | wiki : visité en 2943 (Christian Meyer) ; campement vanduul sur Vanguard III en 2943 | **fait** : 2943 affiché, marqué « source communautaire » (14 systèmes restent sans date) |
| Viking | wiki : « connu » en 2686, « visité » en 2883 (les deux valeurs se contredisent) | garder « non précisée » |

À faire si tu veux aller plus loin : ouvrir la Galactapedia de RSI dans un navigateur (le champ « Discovered in » se charge dynamiquement) pour Bacchus et Vanguard.

## Mobile et clavier (octobre 2026)

- **Mobile** : un tap sur un système ouvre la fiche en volet bas (45 % de la hauteur au plus) ; un tap est résolu vers le système le plus proche (24 px au doigt, 14 px à la souris) ; le pincement zoome (astuce affichée une fois) ; la vue de départ est cadrée sur le cœur de la carte, « cadre » montre toute la carte.
- **Clavier** : un seul arrêt de Tab sur la carte ; flèches = système voisin le plus proche ; Entrée/Espace = fiche ; `+` `-` `=` = zoom ; `0` = vue d’ensemble ; Maj + flèches = déplacer ; Échap = fermer la fiche ; `[` `]` ou PageUp/PageDown = changer d’année. Rappel dans « ? Aide clavier » (panneau Filtres).
- **Noms** : l’anti-collision compte aussi les symboles et les obstacles (panneaux, commandes) ; priorité sélection > survol > grands systèmes > nombre de liaisons.

## Itinéraire entre deux systèmes (octobre 2026)

Option A de `docs/itineraire/` : section « Itinéraire » du panneau Filtres (rail gauche ; panneau flottant « Filtres » sur téléphone). Code dans `public/route.js` et `public/route.css`, branché par `map.js`.

- **Champs** : Départ et Arrivée sont des combobox ARIA (liste de suggestions, ↑ ↓ Entrée Échap) ; la recherche ignore accents, casse et apostrophes (« el'sin » trouve El’sin). Les 90 systèmes sont proposés ; ceux dont la date de découverte est postérieure à l’année affichée portent « pas encore découvert en <année> ». Le bouton ⇄ « Inverser » échange les deux champs. Depuis la fiche d’un système, « Itinéraire depuis ici » et « Itinéraire jusqu’ici » remplissent un champ (sur téléphone : le panneau Filtres s’ouvre sur la section).
- **Calcul** : plus court chemin **en nombre de sauts** (parcours en largeur), sur les liaisons actives à l’année affichée avec la règle de la carte (`année >= e.y && (!e.u || année < e.u)`) ; le nombre de sauts est le nombre de liaisons. À égalité, le chemin est déterministe (ordre des liaisons de `data.js`). Le calcul est refait à chaque changement d’année (lecture, curseur, flèches) ou de champ ; le résumé est une zone `role="status"` (muette pendant la lecture automatique, ré-annoncée à l’arrêt).
- **Cas d’erreur** (messages dans la zone de statut) : champ vide ; nom inconnu ou ambigu ; départ = arrivée ; système sans aucun point de saut publié (« Aucun point de saut publié pour Virgo », d’après les systèmes sans liaison de `data.js`) ; aucune route à l’année affichée, avec la raison quand elle est connue (« Stanton n’est découvert qu’en 2903 », sinon « les liaisons ne sont pas encore ouvertes ») et un bouton « Voir en <année> » vers la plus petite année (2100 à 2956) où une route existe ; « Aucune route à aucune date connue » si aucune année ne convient. Exemple de contrôle : Sol → Stanton = 4 sauts en 2956, aucune route en 2900, première route en 2903.
- **Sur la carte** : trait sauge de 4 px avec halo entre les liaisons et les systèmes, liaisons déduites en pointillés, badges numérotés au milieu de chaque saut, repères « Départ » et « Arrivée » (texte), le tout suivant le zoom (badges et repères gardent une taille fixe à l’écran). Les noms des systèmes de l’itinéraire passent en priorité dans l’anti-collision, les badges et repères comptent comme obstacles. Le tracé disparaît à l’effacement ou si la route est impossible.
- **Lien partageable** : format additif `#carte/<année>/<système>?de=<id>&vers=<id>`, par exemple `#carte/2956/stanton?de=sol&vers=stanton` (identifiants de `data.js`). Les paramètres sont facultatifs et la partie système aussi (`#carte/2900?de=sol&vers=stanton`). Les anciens liens `#carte/année/système` fonctionnent sans changement et n’effacent pas un itinéraire déjà saisi. « Copier le lien » et l’adresse de la page incluent l’itinéraire.
- **Limites** : aucune distance, durée ou taille de saut (donnée non disponible, mentionnée dans le panneau) ; seul le plus court chemin en nombre de sauts est proposé, sans variante ; l’année d’ouverture d’une liaison n’est affichée que lorsqu’elle est explicite dans `data.js` (trois liaisons) ; les liaisons « déduites » viennent des pointillés de la carte.
