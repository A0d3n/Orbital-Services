# Vérification du lore (25 octobre 2026)

Neuf points de `public/data.js` ont été relus contre des sources. « Officiel » = robertsspaceindustries.com (Galactapedia, Comm-Links, Galactic Guide) lu directement ; « wiki » = starcitizen.tools (communautaire). La Galactapedia est une page dynamique : plusieurs articles n'ont pas pu être lus en entier. Rien n'a été ajouté qui ne soit dans une source.

| Point | Verdict | Ce qui a changé | Source |
|---|---|---|---|
| Nexus 2931 : « l'UNE reprend pied après un gisement » | corrigé | C'est l'UEE ; le gisement n'est pas daté 2931 dans les sources, retiré. Texte : l'UEE reprend le système après la course de Dean Kellar, l'opération est toujours en cours. | officiel : Galactapedia « Nexus system », Galactic Guide Nexus (Comm-Link 15131) |
| Hadur découvert en 2529 alors que l'Empire xi'an est « découvert » en 2530 | confirmé, pas d'incohérence | Rien. 2529 est la découverte par les Xi'an eux-mêmes ; la découverte humaine date de 2531 (Teesa Morrison), déjà dans la fiche. | wiki : Hadur System (date 2529 non expliquée par la page) |
| Ligne Perry : retrait xi'an en 2789 puis cession en 2793 | pas de contradiction, 2 corrections | « coupe l'accès humain aux systèmes voisins » retiré (les frontières des systèmes de transition restent ouvertes). Le pacte est ratifié le 5 juillet 2793 et partage les huit systèmes entre l'UEE et les Xi'an. Pallas et Indra : « attribué à l'Empire xi'an » au lieu de « perdu par l'humanité ». | wiki : Perry Line Treaty, Perry Line ; Comm-Link RSI « System Unlock: Hadur » (2013) |
| Seconde guerre tevarine : « cinquante ans plus tard » | corrigé | 57 ans après la fin de la première guerre (2546 → 2603). | wiki : Second Tevarin War |
| 2910 « Les Vanduul attaquent Squadron 42 » | non étayé officiellement | Reformulé : « Le 42nd Squadron affronte les Vanduul » en 2910 et 2911, d'après le wiki ; le lien avec la campagne solo n'est pas confirmé. L'image vient d'une newsletter Squadron 42 (voir `docs/images.md`). | wiki : 42nd Squadron |
| 2950 « Élection impériale » | confirmé, complété | Laylani Addison remporte l'élection de 2950 (Comm-Link officiel). Dates du wiki : résultats le 1er novembre 2950, investiture le 1er janvier 2951. Le pourcentage cité par le wiki n'est pas repris (incertain). | officiel : Comm-Link 17851 « 2950 Imperator Election Results » ; wiki : 2950 UEE Imperatorial election |
| Rytif : « Terra Mills est née » en 2716 | corrigé | Fusion de Terragra et de Bremen Mills en 2717, devenue Terra Mills. | wiki : Terra Mills (page Galactapedia non chargée) |
| Rytif : « les Prallies conquièrent l'Empire » | retiré | Aucune source. Les Prallies sont seulement le snack le plus populaire de Terragra. | wiki : Terra Mills |
| Rytif : Bremen Mills en 2603, krach du blé en 2640 | non vérifié | Inchangés ; à contrôler à la source. | — |

## Ce qui reste à vérifier
- Rytif 2603 et 2640 (voir ci-dessus).
- Les dates de la seconde guerre tevarine divergent selon les sources (début 15 février ou 9 mars 2603 ; sabordage le 24 ou le 25 juin 2610) : `data.js` garde le 24 juin 2610, non confirmé.
- Les points marqués « wiki » seraient à recouper avec la Galactapedia dès que ses pages seront lisibles.
