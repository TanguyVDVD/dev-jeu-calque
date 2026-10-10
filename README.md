# Calque

> Chaque passage laisse une trace.

Un jeu de plateforme compétitif pour 2 à 4 amis, dans le navigateur. Des manches (« feuilles ») de 15 secondes, toujours sur la même planche : tout ce que chacun a fait aux feuilles précédentes rejoue en même temps. Tes tracés te portent, ceux des autres te barrent la route.

Un seul conteneur Docker sert le jeu et le WebSocket. Un tunnel Cloudflare l'expose sur Internet.

## Jouer

Il faut Docker. Rien d'autre.

### 1. En local

```sh
docker compose up -d --build
```

Le jeu est sur <http://localhost:3000>. Ouvre un atelier, colle le lien dans la conversation (les autres doivent pouvoir joindre ta machine : même réseau, ou tunnel ci-dessous).

Autre port : `GAME_PORT=8080 docker compose up -d --build`.

### 2. Sur Internet sans compte : tunnel rapide

```sh
docker compose --profile quick up -d --build
npm run tunnel-url          # affiche https://<quelque-chose>.trycloudflare.com
```

Sans Node sur la machine, la même adresse se lit dans les journaux :

```sh
docker compose --profile quick logs cloudflared-quick | grep trycloudflare.com
```

À savoir sur le tunnel rapide (documentation Cloudflare) :

- l'adresse **change à chaque démarrage** du conteneur `cloudflared-quick` ;
- **aucune garantie de disponibilité** : c'est prévu pour le test et le développement ;
- **200 requêtes simultanées** au plus (au-delà : réponse 429) — largement assez pour quelques salons ;
- pas de Server-Sent Events (le jeu n'en utilise pas : tout passe par un WebSocket) ;
- depuis cloudflared 2026.9.3, l'option `--allowed-mail` réserve l'accès à certaines adresses e-mail (code à usage unique). Elle n'est **pas activée** ici ; pour l'essayer, ajoute par exemple `--allowed-mail 'ami@exemple.fr'` à la commande du service `cloudflared-quick` dans `docker-compose.yml`.

### 3. Sur Internet avec une adresse stable : tunnel nommé

Il faut un compte Cloudflare et un domaine géré par Cloudflare. Étapes manuelles, une seule fois :

1. Tableau de bord Cloudflare → Zero Trust → Networks → Tunnels → **Create a tunnel** → type *Cloudflared*.
2. Copie le **jeton** affiché (la longue chaîne après `--token`).
3. Onglet *Public Hostname* : ajoute un nom d'hôte (par exemple `calque.exemple.fr`), service **HTTP**, URL **`game:3000`**.
4. Dans ce dossier : `cp .env.example .env`, puis colle le jeton dans `TUNNEL_TOKEN=`.

```sh
docker compose --profile named up -d --build
```

Le jeu est à l'adresse choisie à l'étape 3. Les WebSockets passent sans réglage.

### Tu as déjà un tunnel qui tourne ailleurs

Lance seulement le jeu (`docker compose up -d --build`) et fais pointer ton tunnel vers lui :

- tunnel sur la même machine, hors Docker : service `http://localhost:3000` ;
- tunnel dans un autre projet Docker : relie-le au réseau du jeu, puis vise `http://game:3000` :

```sh
docker network connect fantome_default <conteneur-cloudflared>
```

(le réseau s'appelle `<nom-du-dossier>_default` ; `docker network ls` le confirme).

Le jeu ne dépend d'aucun nom d'hôte : chemins relatifs, `ws://` ou `wss://` déduit de la page, en-têtes `X-Forwarded-Host` et `X-Forwarded-Proto` respectés pour l'aperçu du lien.

### Arrêter

```sh
docker compose --profile quick --profile named down
```

## Les touches

Le clavier est lu par position physique : ZQSD sur AZERTY et WASD sur QWERTY sont les mêmes touches.

| Action | Touches |
|---|---|
| Bouger | flèches, ou Q D (A D sur QWERTY) |
| Sauter (appui long = plus haut) | Espace, flèche haut, ou Z (W) |
| Dash horizontal (un par envol) | Maj, X ou K |
| Descendre à travers un de tes tracés | Bas + saut |
| Un mot aux autres | 1, 2, 3, 4 |
| Menu, réglages, quitter | Échap |
| Brouillon : tout effacer | R |

Une manette fonctionne aussi (stick ou croix, A pour sauter, X/B/gâchette pour le dash).

## Développer

Il faut Node 20 ou plus récent.

```sh
npm install
npm run dev            # serveur (WebSocket) sur :3000, relancé à chaque modification
npm run dev:client     # dans un autre terminal : le client avec rechargement à chaud sur :5173
npm test               # règles, arènes, serveur : toute la suite
npm run build          # dist/client (précompressé) + dist/server/main.js + og.png
npm start              # sert le résultat de build sur :3000
npm run bench          # les budgets de performance ; échoue si l'un est dépassé
npm run e2e -- bots  http://localhost:3000 4    # 4 clients automatisés : partie + revanche
npm run e2e -- tabs  http://localhost:3000      # 2 onglets Chromium : partie + revanche, captures dans shots/
npm run e2e -- shots http://localhost:3000      # captures des autres écrans
npm run e2e -- ws    https://xxx.trycloudflare.com   # /healthz et WebSocket à travers le tunnel
```

`tabs`, `shots` et le banc de rendu ont besoin de Chromium : `npx playwright install chromium`.

L'architecture, les conventions et l'état du projet sont dans [CLAUDE.md](CLAUDE.md), [AVANCEMENT.md](AVANCEMENT.md), [DECISIONS.md](DECISIONS.md) et [IDENTITE.md](IDENTITE.md).

## Ajouter une planche (arène)

Une planche est un fichier texte dans `src/shared/arenas/`. Le préfixe numérique fixe l'ordre dans le menu. On ne décrit que la **moitié gauche** (20 colonnes × 20 lignes) : le moteur fabrique la droite par symétrie, l'équité est garantie par construction.

```
# commentaire libre
name: Ma planche
mover: 12 19 3 5 0 300 240
---
#...................
(… 20 lignes de 20 caractères …)
####################
```

| Caractère | Sens |
|---|---|
| `#` | bloc solide |
| `.` | vide |
| `^` | pointes (gommé au contact) |
| `=` | trappe : on la traverse par-dessous, on se pose dessus |
| `S` | départ des joueurs de gauche (posé sur le sol de la ligne suivante) |
| `G` | mire des joueurs **de droite** (celle des joueurs de gauche est son miroir) |

`mover: x y l dx dy période phase` ajoute une plateforme mobile (et sa jumelle en miroir) : position et largeur en tuiles, déplacement en tuiles, période et phase en ticks (60 par seconde). Son cycle est fixe et repart de zéro à chaque feuille.

Repères de conception (vérifiés par `tests/physics.test.ts`) : un saut franchit une corniche de **3** tuiles ; **4** tuiles demandent un tracé allié ; **5** en demandent deux, ou une courte échelle. Un vide de moins de 12 tuiles se franchit au saut + dash.

Ensuite :

1. ajoute ses runs de référence dans `tests/routes.ts` (une route de base sans tracé en moins de 11 s, et un raccourci avec tracé allié) — l'outil `drive()` de `tests/helpers.ts` permet de les écrire avec des conditions (« cours jusqu'à x = 250 ») puis de les figer ;
2. `npm test` : symétrie, faisabilité et robustesse sont vérifiées pour toutes les planches.

Sans runs de référence, `tests/arenas.test.ts` échoue : c'est voulu.

## Dépannage

| Symptôme | Piste |
|---|---|
| `port is already allocated` | Un autre programme occupe 3000 : `GAME_PORT=3001 docker compose up -d`. |
| `npm run tunnel-url` ne trouve rien | Le profil `quick` tourne-t-il ? `docker compose --profile quick ps`. cloudflared met quelques secondes à obtenir son adresse. |
| Le tunnel nommé redémarre en boucle | `TUNNEL_TOKEN` vide ou faux dans `.env` : `docker compose --profile named logs cloudflared-named`. |
| « Cet atelier n'existe pas, ou plus » | Un atelier vide est fermé au bout de 30 s, et tous disparaissent au redémarrage du conteneur (l'état est en mémoire). |
| « Connexion perdue. On recolle la feuille… » | Le client se reconnecte seul et reprend sa place. Si ça dure : `docker compose ps` doit afficher `healthy`. |
| « Cette place vient de rouvrir dans un autre onglet » | Deux onglets du même navigateur partagent la même place (le jeton de reconnexion). Pour tester seul à deux joueurs, ouvre le lien dans une fenêtre privée ou un autre navigateur. |
| Pas de son | Le son démarre au premier clic ou à la première touche ; vérifie le volume dans Réglages (Échap). |
| Les lettres affichées ne sont pas celles de mon clavier | Seuls les navigateurs Chromium donnent la disposition ; ailleurs le jeu parle de « flèches ». Les touches fonctionnent pareil. |
| Sur téléphone | Le jeu demande un clavier et le dit. |
