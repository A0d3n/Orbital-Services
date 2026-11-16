# Instructions pour Claude

## Règle de délégation
- Collecte → sous-agents : confier la lecture massive de fichiers, la récupération de pages web et les recherches simples au sous-agent `haiku` ; l'extraction et la compréhension de code, ainsi que le croisement de sources, au sous-agent `sonnet`.
- Réfléchir, résumer, décider → agent principal : la conception, les choix, les modifications de code et la synthèse finale restent ici.
- Lancer plusieurs sous-agents en parallèle quand les collectes sont indépendantes.
