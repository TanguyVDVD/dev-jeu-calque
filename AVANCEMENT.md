# Avancement

## Jalon en cours

Aucun : les sept jalons du brief sont terminés (voir `RAPPORT.md`).

| Jalon | État |
|---|---|
| 1. Identité et plan | fait — `IDENTITE.md` |
| 2. Cœur de simulation, tests, banc, bac à sable | fait — `src/shared/sim.ts`, `tests/physics.test.ts`, terrain d'essai du salon |
| 3. Boucle des fantômes en solo, entraînement | fait — `tests/ghosts.test.ts`, mode « Brouillon » |
| 4. Multijoueur | fait — `src/server/`, `src/client/session.ts`, `tests/server.test.ts` |
| 5. Arènes et réglages | fait — trois planches, `tests/arenas.test.ts`, `tests/routes.ts` |
| 6. Identité appliquée, finitions | fait — rendu, son, écrans, podium, émotes |
| 7. Budgets, Docker, tunnel, docs, bout en bout, relecture | fait — `bench/all.ts`, `Dockerfile`, `docker-compose.yml` |

## Reste à faire (rien de bloquant)

- Bonus de la section 14 : équipes 2 contre 2, adversaire d'entraînement, commandes tactiles.
- Un grand raccourci propre à « Passerelle » (Atelier et Colonne ont le leur, avec run de référence), et un second raccourci à un tracé prouvé par planche.
- Équilibrage à la main : les valeurs physiques et les planches ont été réglées par la simulation et la mesure, jamais clavier en main.

## Problèmes connus

- Les routes de base durent 7,2 à 9,2 s et non 9 à 10 s ; le raccourci testé de « Colonne » ne gagne que 0,6 s (voir `DECISIONS.md`, « Arènes »).
- Sur « Colonne », les deux routes de base se croisent de front au sommet : un tracé adverse y repousse le joueur qui ne le piétine pas. C'est le jeu, mais c'est la planche la plus dure pour des débutants ; « Atelier » est celle par défaut.
- Tunnel nommé : non vérifié de bout en bout (il faut un jeton et un domaine). La commande et la variable sont celles de la documentation Cloudflare ; le tunnel rapide, lui, est vérifié.
- Son et manette : écrits, jamais entendus ni tenus en main (pas de sortie audio ni de manette en environnement automatisé).
- Seuls les navigateurs Chromium donnent la disposition du clavier ; ailleurs l'aide parle de « flèches ».
- L'état est en mémoire : un redémarrage du conteneur ferme tous les ateliers.
