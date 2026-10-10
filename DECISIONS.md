# Décisions prises sans validation

Une ligne par choix : ce qui est retenu, ce qui est écarté, pourquoi. Les plus importantes sont marquées **★**.

## Identité

- **★ Nom « Calque », univers papier/encre/crayon, fond clair.** Écartés : « Rembobine » (VHS, trop proche du néon rétro), « Doublure » (théâtre sombre, fantômes peu lisibles). Le vocabulaire du dessin fournit tous les statuts de lisibilité demandés (plein, hachuré, pointillé, contour). Détail dans `IDENTITE.md`.
- Polices : Architects Daughter (titres) et DM Mono (texte, chiffres à chasse fixe), sous-ensemble latin de Fontsource (43 Ko en tout). Pas de sous-ensemble sur mesure : il aurait fallu une dépendance de plus pour gagner ~20 Ko sur un budget tenu à 23 %.
- Le logo est un lettrage en segments défini dans le code (`src/shared/logo.ts`), pas une police : le même tracé sert au SVG de la page et à l'image d'aperçu, générée sans navigateur ni police.
- Pas de glyphes de flèches ni d'emoji dans l'interface : hors du sous-ensemble latin, le navigateur les remplaçait par des emoji colorés. Les touches sont nommées en toutes lettres.
- Émotes en mots (« Ha ! », « Oups », « Bien vu », « Revanche ! ») dans une étiquette manuscrite, plutôt que des pictogrammes.

## Règles

- **★ Le dash a un temps de recharge de 0,6 s** (en plus de « un par envol »). Sans lui, enchaîner les dashs au sol devenait le seul moyen de se déplacer (15 tuiles/s contre 9) et écrasait le saut.
- **★ Sauter pendant un dash l'interrompt sans garder sa vitesse.** Sinon un saut-dash franchissait 15 tuiles et aucun vide d'arène ne tenait.
- Élan transmis par un tracé allié plafonné : +2,5 px/tick vers le haut, ±4 à l'horizontale, 6 ticks de tolérance. Sauter quand son tracé saute donne plus de 2 tuiles de mieux (testé), sans traverser l'écran.
- Saut : 5,3 px/tick, gravité 0,272 en montée et 0,5 en descente, sommet adouci. Mesuré : 3,44 tuiles, 0,63 s en l'air (cible : 3,4 et 0,6).
- Rebond : 5,6 px/tick (3,4 tuiles), 6,35 si saut maintenu (4,5 tuiles).
- Contact « par le dessus » : pieds à 5 px ou moins sous le sommet du tracé adverse, y compris en arrivant de côté. Les morts « j'étais dessus pourtant » sont les plus injustes.
- Tolérance d'écrasement : 4 px de glissement perpendiculaire avant de déclarer le KO.
- Un tracé adverse est intangible pour moi **s'il se trouve dans** une de mes marges (zone de 5 × 3 tuiles autour du départ, 5 × 4 autour de la mire). Écarté : rendre le joueur invulnérable quand *lui* est dans sa marge — moins lisible, et la règle de superposition couvre déjà la sortie.
- Dernier sol ferme : tuile fixe sous le centre du corps, sans pointes dans les tuiles voisines.
- **★ Départage : tous les joueurs rejouent, pas seulement les ex æquo**, points normaux, trois feuilles au plus puis victoire partagée. Plus simple, personne ne regarde, et les tracés continuent de s'empiler.
- **★ Tout joueur assis et connecté participe** dès que l'hôte lance (il faut deux « prêts », l'hôte compte comme prêt). Écarté : laisser de côté les non-prêts, source de malentendus en vocal.
- Seul l'hôte lance, relance (revanche) et ramène à l'atelier. « Changer de planche » ramène à l'atelier, curseur sur le choix de planche.
- Rotation des côtés : l'ordre des sièges tourne d'un cran à chaque revanche. À 2 et à 4, tout le monde change de côté ; à 3, la place du joueur seul tourne.
- Les plateformes mobiles sont traversantes (comme les tracés alliés) : elles portent, ne poussent pas, n'écrasent pas. Une seule mécanique de portage à comprendre.
- Les trappes (`=`) sont des tuiles traversantes fixes : même règle que la tête d'un tracé allié.
- Un joueur qui recharge la page en pleine feuille ne peut pas reprendre sa course (l'état local est perdu) : il regarde la fin et joue la suivante. Son tracé s'arrête où ses données s'arrêtent. Si seule la connexion tombe (page vivante), la course continue et rien n'est perdu.

## Arènes

- **★ Les durées s'écartent des valeurs de départ du brief.** Routes de base mesurées par les runs de référence, sans dash : Atelier 9,20 s, Colonne 7,20 s, Passerelle 9,07 s (cible : 9 à 10 s). Raccourcis avec un tracé allié : gains de 1,6 s, 0,6 s et 3,3 s (cible : 2 à 3 s). Raison de fond : une arène symétrique où chacun part d'un côté et vise l'autre ne peut pas forcer d'aller-retour, donc la route de base est bornée ; la rallonger voulait dire des couloirs. Les gains mesurés incluent le temps perdu à grimper sur un tracé arrivé *en même temps* que soi ; avec un tracé déjà en place, compter 0,5 s de mieux.
- Grands raccourcis à deux tracés, prouvés par un run de référence (`GRAND` dans `tests/routes.ts`) : Atelier 6,38 s (gain 2,8 s), Colonne 4,97 s (gain 2,2 s) ; cible du brief : 4 à 5 s de gain. **Passerelle n'en a pas de distinct** : les barreaux ne battent pas l'ascenseur attrapé un cycle plus tôt par la passerelle haute (5,73 s), qui joue donc ce rôle avec un seul tracé.
- Sur Colonne, le pied de la cheminée basse ne s'atteint pas par le sol (pointes sous une corniche) : il faut passer par la première corniche et un dash sous la chicane.
- Atelier : quatre niveaux en lacets à 4 tuiles d'écart, trappes alignées. Écartée : une première version à trois niveaux avec des trous dans la route de base (une chute coûtait 2 s à un débutant sur la planche d'apprentissage).
- Colonne : les deux boyaux sont protégés par des chicanes pour n'être accessibles que par-dessous, avec un tracé. Les pointes sont au pied de la colonne et non au sommet (le plafond y empêche de les sauter).
- Passerelle : l'ascenseur a un cycle de 3,3 s et les navettes de 5 s, calés pour que la route de base n'attende presque pas ; la passerelle haute fait gagner un cycle d'ascenseur.
- Un vide « infranchissable » doit faire au moins 14 tuiles (saut + dash + coyote + débord = 12).

## Architecture et réseau

- TypeScript partout, Vite, Canvas 2D, `ws`, Vitest : la recommandation du brief, suivie telle quelle.
- **★ Le serveur est empaqueté en un seul fichier (ws inclus)**, par Vite en mode SSR. L'image d'exécution ne contient que Node et `dist/` : 49 Mo. Conséquence : les deux modules natifs optionnels de ws sont désactivés à la compilation (sans cela le paquet plantait à la première trame de plus de 32 octets — trouvé par le test de bout en bout, pas par les tests unitaires).
- À la fin de chaque feuille le serveur renvoie à tous **sa** copie complète de chaque run. C'est elle, et non l'enregistrement local, qui devient le tracé : tous les clients rejouent exactement les mêmes octets, même après une perte de paquets.
- L'accusé « j'ai tous les runs » part à la réception des résultats (les trames arrivent dans l'ordre sur la même connexion). Le serveur attend ces accusés 3,6 s, puis 2 s de plus au maximum.
- Battement de cœur : un ping toutes les 5 s (il sert aussi à estimer le décalage d'horloge), connexion coupée après 30 s de silence. Plus fréquent que les 20 s suggérées, pour une horloge plus juste.
- Trames de run : 3 octets par tick (drapeaux, dx, dy), échappement en absolu quand un écart dépasse un octet (retour de KO). 0,35 Ko/s en course, 2,7 Ko pour un run complet.
- Les rivaux vivants sont affichés 6 ticks (100 ms) dans le passé, interpolés.
- Limites : 50 salons, 4 joueurs + 8 spectateurs, messages de 6 Ko au plus, 60 messages/s par connexion (rafale de 120), 800 connexions.
- Codes de salon : 4 consonnes (pas de mot involontaire, rien à confondre à l'oral).
- Mise à l'échelle du temps (`realClock(scale)`) injectée dans le serveur et les clients : les tests jouent des parties entières en accéléré avec le vrai code.
- `window.__calque` expose l'état et permet de scripter les entrées : c'est ce qui rend le jeu testable dans un vrai navigateur. Aucun secret n'y passe.

## Rendu et performances

- **★ Tout ce qui bouge est dessiné en pixels écran à des positions entières.** Mesuré : les positions interpolées (flottantes) passées à `drawImage` allouaient 2 Ko par image ; en entiers, plus rien. C'est aussi plus net.
- Chaque variante de personnage (4 couleurs × 7 statuts × 2 sens) et chaque numéro est pré-rendu en sprite ; le décor est dessiné une fois. Une image = ~100 copies.
- L'arrêt sur image au rebond et la secousse sont purement visuels : la simulation reste calée sur l'horloge.
- HUD et écrans en HTML/CSS ; le chrono ne touche le DOM que quand le dixième change.
- L'image d'aperçu est tracée par un petit rasteriseur maison (`scripts/postbuild.ts`) : pas de navigateur dans l'image de compilation.
- `index.html` et `404.html` ne sont pas précompressés : le serveur y injecte l'adresse publique à chaque requête (1,4 Ko).

## Hors périmètre, non fait

- Les trois bonus (équipes, adversaire d'entraînement, tactile) ne sont pas faits.
- Pas de sous-ensemble de police sur mesure, pas de WebGL, pas de worker : aucune mesure ne le réclamait.
