# Calque — notes pour reprendre

Jeu de plateforme compétitif en ligne (2–4 joueurs, navigateur). Brief complet : `prompt-claude-code-fantomes.md`. Identité : `IDENTITE.md`. Choix : `DECISIONS.md`. État : `AVANCEMENT.md`.

## Commandes

```sh
npm test                 # vitest : règles, arènes, serveur (≈ 1 min, le serveur joue des parties accélérées)
npm run build            # dist/client + dist/server/main.js + og.png + .br/.gz
npm start                # sert dist/ sur :3000
npm run dev              # serveur seul, rechargé ; npm run dev:client pour le client (:5173, proxy /ws)
npm run bench            # budgets de la section 9 ; code de sortie 1 si dépassement (build requis)
npm run e2e -- bots|tabs|shots|ws [url]
docker compose up -d --build            # + --profile quick | named pour le tunnel
npx tsc --noEmit -p .    # vérification des types
```

## Architecture

```
src/shared/   pur, sans DOM ni horloge — utilisé par client, serveur, tests
  sim.ts        la simulation : physique entière, fantômes, événements. step(input) = 1 tick
  arena.ts      lecture des planches texte (moitié gauche, miroir) ; arenas/*.txt
  codec.ts      trames binaires de run (3 octets/tick)
  protocol.ts   messages JSON, constantes de temps et de limites
  clock.ts      horloge injectable (échelle de temps pour les tests)
  name.ts       LE nom du jeu ; logo.ts : le lettrage
src/server/   room.ts (salon, manches, score, relais) · server.ts (HTTP, WebSocket, garde-fous) · main.ts
src/client/   session.ts + runner.ts (sans DOM, partagés avec les bots de test)
              game.ts (boucle, modes) · render.ts (canvas) · main.ts (écrans HTML) · audio.ts · input.ts
              howto.ts (démos) · texts.ts (TOUS les textes français)
tests/        helpers.ts (DSL d'entrées, drive) · routes.ts (runs de référence) · bot.ts (client simulé)
bench/all.ts  un banc par budget
scripts/      postbuild.ts (og.png, précompression) · e2e.ts · tunnel-url.mjs
```

Principe réseau : chaque client simule **son** joueur en local ; les fantômes sont des enregistrements rejoués tels quels ; les vivants ne se touchent pas. Le serveur ne simule rien : il donne l'heure, compte les points, stocke et relaie les runs.

## Conventions

- Code et commentaires en anglais ; textes du jeu en français, uniquement dans `src/client/texts.ts`.
- Identifiants neutres dans le code (`ghost`, `round`, `goal`), vocabulaire de l'univers seulement dans les textes.
- Aucune allocation dans `Sim.step` ni dans `View.draw` : tableaux typés, positions entières à l'écran.
- La simulation doit rester exactement symétrique gauche/droite (arrondis, ordre des essais) : `tests/arenas.test.ts` le vérifie avec les runs miroir.
- Ne jamais adapter un test pour le faire passer. Si une règle ou une planche change, les runs de `tests/routes.ts` se refont avec `drive()` (voir README, « Ajouter une planche »).
- Toucher à `P` (constantes physiques de `sim.ts`) invalide les runs de référence et les démos de `howto.ts`.
