# Itinéraire entre deux systèmes : 3 maquettes

Maquettes autonomes (aucune dépendance). Mini-carte schématique : seules les années Pyro 2493, Terra 2516, Stanton 2903 sont réelles ; les autres années d’ouverture et les positions sont illustratives. Le calcul (plus court chemin en sauts, liaisons actives à l’année affichée) est réel dans les maquettes.

- **A-panneau.html** : section « Itinéraire » dans le panneau Filtres, deux champs Départ/Arrivée, ⇄, résumé et liste d’étapes cliquables.
  Avantages : le plus découvrable, clavier naturel (champs ARIA), erreurs expliquées au même endroit. Risques : volet bas chargé sur mobile, saisie au clavier virtuel qui masque la carte.
- **B-clic.html** : on clique sur la carte, « Itinéraire depuis ici », puis un second clic ; barre flottante « Sol → Stanton · 4 sauts » dépliable.
  Avantages : geste direct, aucune saisie, très mobile. Risques : peu découvrable, Maj+clic inexistant au doigt, plus de code carte (états départ/arrivée, collisions de tags), accès clavier à soigner.
- **C-fiche.html** : bouton « Itinéraire vers… » dans la fiche du système, destination par champ, frise verticale avec années d’ouverture et badge « déduite ».
  Avantages : réutilise la fiche et le volet bas existants, lecture des étapes la plus claire, peu de code carte. Risques : départ imposé par la fiche (inverser demande de changer de fiche), fonction cachée derrière la fiche.
- **Recommandation** : A comme base (champs + liste, le plus simple et accessible), avec le geste de B en raccourci (« Itinéraire depuis ici » dans la fiche) ; la frise de C peut remplacer la liste d’étapes de A si les années d’ouverture sont fiables.
- Taille des points de saut : donnée non disponible, simple ligne discrète dans A et C ; aucune distance ni durée.
