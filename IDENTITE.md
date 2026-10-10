# Identité — CALQUE

## Nom et accroche

**Calque.** « On se fait un Calque ? »

> Chaque passage laisse une trace.

Un calque, c'est la feuille translucide qu'on pose sur un dessin pour le reprendre. C'est aussi un décalque : une copie exacte. Le nom dit la règle du jeu en un mot, se prononce en une syllabe et demie, et n'est porté par aucun jeu connu.

### Pistes écartées

| Piste | Idée | Pourquoi non |
|---|---|---|
| **Rembobine** (cassette VHS, bandes magnétiques, neige) | Chaque manche rembobine la bande | Mène tout droit au néon rétro passe-partout que le brief demande d'éviter ; trois syllabes ; le « rewind » est déjà un cliché du genre. |
| **Doublure** (théâtre, coulisses, projecteurs) | Les fantômes sont des doublures qui rejouent la scène | Belle fiction, mais scène sombre + projecteurs = fantômes peu lisibles ; et rien n'explique pourquoi la doublure adverse est solide. |
| **Calque** (table lumineuse, papier, encre) — retenue | Chaque manche est une feuille posée sur les précédentes | Le vocabulaire du dessin fournit déjà tous les statuts de lisibilité demandés : trait plein, hachure, pointillé, contour. Fond clair, donc contraste maximal. |

## Univers (trois phrases)

Une table lumineuse, une pile de feuilles de calque, des bonshommes de papier qui courent dessus. À chaque manche on pose une nouvelle feuille, et tout ce qui a été tracé en dessous reste visible : ton propre tracé est au crayon, tu le connais, tu t'appuies dessus ; celui des autres est à l'encre, sec, dur, il te barre la route. On recommence parce qu'un dessin n'est jamais fini : on pose une feuille de plus.

### Vocabulaire

| Dans le code | Dans le jeu |
|---|---|
| round | **une feuille** (« Feuille 3 sur 8 ») |
| ghost | **un tracé** (« monte sur mon 3 ») |
| goal | **la mire** (la croix de repérage qui sert à aligner les calques) |
| KO | **gommé** |
| stomp (rebond sur un fantôme adverse) | **estomper** (« tu l'as estompé ») |
| sanctuary | **la marge** |
| lobby | **l'atelier** |
| arena | **une planche** |
| podium | **le rendu** |
| training | **le brouillon** |
| tiebreak round | **feuille de départage** |

## Ton

Sec, complice, un peu prof de dessin. Phrases courtes, jamais de point d'exclamation en rafale, jamais d'emoji. Le jeu commente comme quelqu'un qui regarde par-dessus ton épaule.

- KO : « Gommé. » · « Coincé contre l'encre. » · « Hors de la feuille. » · « Les pointes, ça ne pardonne pas. »
- Annonces : « Feuille 1 — page blanche. » · « Feuille 4. Ça commence à être chargé. » · « Dernière feuille. Elle compte double. » · « Feuille de départage. »
- Résultats : « Premier à la mire. » · « Pas arrivé. Ton tracé reste quinze secondes entières. »
- Récompenses : « Le paillasson — son tracé a été estompé 7 fois. » · « Le bouchon — a gommé 4 adversaires sans bouger. » · « La courte échelle — 9 appuis sur ses propres tracés. » · « Le trait le plus vif — 6,42 s. » · « La gomme d'or — gommé 5 fois. »
- Erreur : « Cette feuille n'existe pas. »

## Palette

Fond clair : c'est le parti pris. Le vivant est ce qu'il y a de plus saturé et de plus sombre sur la feuille.

| Rôle | Couleur | Usage |
|---|---|---|
| Papier | `#F1EBDC` | Fond de l'arène et des écrans |
| Papier ombré | `#E4DCC8` | Panneaux, bande du HUD |
| Quadrillage | `#D6CDB6` | Papier millimétré, toujours discret |
| Encre | `#26221D` | Décor solide, texte, contours durs |
| Graphite | `#7D766A` | Texte secondaire, tracés neutralisés |
| Rouge correction | `#C8321F` | Dangers (pointes), alertes, 3 dernières secondes |
| Lumière | `#FFFDF6` | Éclats, repère sur la tête des tracés adverses |

Quatre couleurs de joueurs, tirées de la palette Okabe-Ito (distinguables en deutéranopie, protanopie et tritanopie), chacune doublée d'un **motif** et d'une **forme de tête** :

| Joueur | Couleur | Motif | Tête |
|---|---|---|---|
| 1 | Bleu `#0072B2` | hachures obliques | coin corné |
| 2 | Vermillon `#D55E00` | points | pointe |
| 3 | Vert `#009E73` | lignes horizontales | plate à deux crans |
| 4 | Mauve `#B0559A` | croisillons | ronde |

## Typographie

- **Titres : Architects Daughter** (OFL) — l'écriture bâton des architectes sur leurs plans.
- **Texte et chiffres : DM Mono** 400/500 (OFL) — la machine à écrire du cartouche ; chiffres à chasse fixe pour le chrono.
- Le logo n'utilise aucune police : c'est un lettrage au normographe (segments droits), défini dans le code, redessiné trois fois avec un léger décalage, comme trois calques mal alignés.

Les deux polices sont embarquées (paquets Fontsource, sous-ensemble latin).

## Personnage

Un **onglet** : un rectangle de papier debout (12 × 20), deux yeux ronds décalés vers l'avant, et une tête dont la découpe change selon le joueur. Reconnaissable à 12 pixels de large par sa découpe et ses yeux.

| Déclinaison | Rendu |
|---|---|
| Moi, vivant | Aplat de ma couleur, contour encre épais, yeux blancs. Seul élément qui s'écrase et s'étire. |
| Mon tracé | Ma couleur en transparence + mon motif, pas de contour latéral, **trait épais débordant sur la tête** (une tablette où se poser), numéro de feuille. |
| Tracé adverse | Aplat opaque de sa couleur, contour encre dur, son motif en encre, **chevron clair sur la tête** (« saute ici »), numéro. |
| Tracé estompé | Contour pointillé graphite, vide. |
| Tracé adverse dans ma marge / superposé | Même forme, à 35 % d'opacité, contour pointillé. |
| Vivant adverse | Contour fin de sa couleur, vide, sans yeux pleins. |

## Mouvement

- Tout est **posé d'un coup**, comme un tampon : les panneaux arrivent en 120 ms avec un léger dépassement, jamais de fondu lent.
- Le personnage s'écrase à l'atterrissage et s'étire au saut ; le dash laisse trois décalques qui s'effacent.
- Un KO, c'est un coup de gomme : le personnage part en miettes de gomme rose-gris.
- Les tracés apparaissent par un éclat (cercle qui se referme) et disparaissent en copeaux.
- Arrêt sur image de 3 images au rebond, secousse légère (désactivable).

## Son

Tout est synthétisé (Web Audio), sec et proche : des bruits de bureau.

- Percussions : bruit filtré court = coup de crayon ; clic grave = tampon.
- Notes : triangle à attaque nette et extinction rapide = bois de crayon frappé. Gamme pentatonique mineure de la.
- Saut : glissando montant court. Dash : souffle filtré. Estomper : deux notes montantes + frottement. Gommé : bruit descendant. Mire : arpège de trois notes.
- Musique : une boucle de 8 mesures à 128 BPM (exactement 15 s), qui **gagne une couche à chaque feuille** : pouls, basse, contretemps crayon, arpège, contrechant, puis octave.
- Les trois dernières secondes : un tic par seconde, de plus en plus aigu.
