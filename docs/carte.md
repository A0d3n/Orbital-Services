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
