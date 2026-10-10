# Brief de réalisation — « Fantômes » (nom de travail)

Tu vas concevoir, coder et livrer un jeu complet : un jeu de plateforme compétitif en ligne, jouable dans le navigateur par 2 à 4 amis, servi par un seul conteneur Docker et exposé sur Internet par un tunnel Cloudflare.

Ce document décrit le jeu, ce qui est imposé, ce qui est laissé à ton jugement et la façon de vérifier ton travail. Lis-le en entier avant d'écrire du code.

**Ton mandat.** Tu travailles en autonomie complète, du premier fichier jusqu'aux critères de la section 13. Ne me pose pas de question et n'attends aucune validation entre les étapes : en cas de doute, tu décides, tu notes ton choix et tu continues. La section 12 explique comment trancher.

**Le public.** Un groupe d'amis en vocal, chacun sur son ordinateur, qui lance une partie en collant un lien dans la conversation. Le jeu doit se comprendre en trente secondes, faire rire dès la deuxième manche et donner envie d'une revanche.

## 1. Le concept

Des manches de 15 secondes, toujours dans la même arène. Chaque joueur court vers son objectif. Tout ce qu'il fait est enregistré, et à chaque nouvelle manche tous les runs précédents de tous les joueurs rejouent à l'identique, en même temps, sous forme de fantômes.

- **Tes fantômes sont des plateformes.** Tu leur montes sur la tête, tu te fais la courte échelle à toi-même.
- **Les fantômes adverses sont des corps solides.** Ils te bloquent, te poussent, t'écrasent. Si tu leur sautes sur la tête, tu rebondis et ils cessent d'exister pour toi jusqu'à la fin de la manche.
- **Les joueurs vivants ne se touchent jamais.** On ne s'affronte pas en direct : on se hante.

Chaque course est donc aussi une construction (un marchepied pour ton futur toi) ou un piège (un obstacle dans le futur de l'autre). À la manche 8 d'un duel, quatorze fantômes rejouent leur chorégraphie pendant que les deux vivants slaloment au milieu.

### Trois piliers à préserver

1. **Tout ce que tu fais reste.** Aucun run n'est jeté. Les erreurs hantent l'arène autant que les réussites.
2. **On ne se touche jamais.** Toute l'interaction passe par le passé. C'est ce qui permet à chaque joueur de simuler sa course en local, sans latence, malgré le tunnel.
3. **Lisible en cinq secondes, profond en cinq manches.** Peu de règles, peu de touches. La richesse vient de l'accumulation.

Si une décision met un pilier en danger, c'est la décision qui est mauvaise.

### Les moments que le jeu doit produire

- **La courte échelle.** Manche 2, tu t'arrêtes une seconde au pied d'une corniche trop haute. Manche 3, tu sautes sur ta propre tête et tu gagnes trois secondes, à chaque manche jusqu'à la fin.
- **Le tremplin involontaire.** L'adversaire a laissé traîner un fantôme : tu rebondis dessus et tu atteins un passage qu'il ne t'aurait jamais offert exprès.
- **Le bouchon.** Tu sacrifies une manche pour planter un corps dans le goulet où l'autre a construit son raccourci. Il doit tout réinventer.
- **Le slalom.** Manche 7, une vingtaine de corps à l'écran, et tu traverses de mémoire parce que tu connais la chorégraphie.
- **La photo-finish.** Deux silhouettes qui filent vers leurs objectifs, départagées au tick.

## 2. Règles

### Format

- 2 à 4 joueurs, chacun pour soi. Une partie se joue dans une seule arène et dure un nombre fixe de manches : 8 à deux joueurs, 7 à trois, 6 à quatre (réglable de 4 à 10 par l'hôte). Elle dure donc deux à trois minutes, ce qui appelle la revanche.
- L'arène tient sur un seul écran, sans défilement, et elle est symétrique gauche-droite. Chaque joueur part en bas d'un côté et son objectif est en hauteur de l'autre côté. Les trajets se croisent : c'est voulu, c'est ce qui fait se rencontrer les fantômes.
- À 3 ou 4 joueurs, deux joueurs partagent un côté : même départ, même objectif. Ils ne se touchent pas, donc rien ne les gêne et aucun n'a d'avance sur l'autre. À trois, le joueur seul de son côté croise plus de fantômes adverses que les deux autres : cette place tourne à chaque revanche.
- Tout le monde voit l'arène dans le même sens, pour que « à gauche » veuille dire la même chose pour tous en vocal. Les côtés s'échangent à chaque revanche.

### Déroulé d'une manche

1. Décompte de 3 secondes, joueurs figés au départ. Les trajectoires des fantômes nés à la manche précédente s'affichent en surimpression, puis s'effacent au top.
2. Course : 15 secondes au maximum, soit 900 ticks à 60 Hz.
3. Toucher l'objectif termine le run : le temps est noté et le joueur regarde la fin en spectateur.
4. La manche s'arrête quand tous les joueurs sont arrivés, ou à 15 secondes.
5. Résultats pendant 3 à 4 secondes (ordre d'arrivée, temps, écart avec sa manche précédente, points, classement), puis manche suivante. Vise moins de 8 secondes entre deux courses : le rythme fait partie du plaisir.

### Score

- 3 points au premier arrivé, 1 point à chaque autre joueur qui atteint son objectif, 0 à qui n'arrive pas. Arrivées au même tick : tous premiers.
- Dernière manche à points doublés (option de l'hôte, activée par défaut).
- Égalité en tête à la fin : manches décisives, trois au maximum, puis victoire partagée.

### Enregistrement et relecture des fantômes

- À chaque tick, on enregistre pour chaque joueur sa position (en entiers), son orientation, son état d'animation et quelques drapeaux (présent ou non, en dash…).
- Un fantôme rejoue ces positions telles quelles. Il n'est jamais re-simulé, rien ne le dévie, rien ne l'arrête. C'est le choix technique central : comme tous les fantômes sont des enregistrements et que les vivants ne les influencent pas, chaque manche rejoue exactement la précédente, avec les nouveaux vivants en plus. Aucune divergence possible, aucun paradoxe à gérer.
- Un fantôme existe du tick 0 jusqu'à la fin de son run. S'il a touché l'objectif, il disparaît à cet instant. Conséquence voulue : un run rapide laisse un fantôme bref, un run qui n'arrive pas hante l'arène pendant 15 secondes entières. Sacrifier une manche pour poser un obstacle durable est donc un vrai choix, et le joueur en tête ne fait pas boule de neige.
- Chaque fantôme affiche le numéro de sa manche, pour qu'on puisse en parler (« monte sur mon 3 »).
- Les éléments mobiles d'une arène suivent un cycle fixe remis à zéro à chaque manche. Ils ne réagissent jamais aux joueurs, sinon les enregistrements cesseraient d'être cohérents.

### Tes fantômes

- Ce sont des plateformes traversantes : on passe à travers par les côtés et par-dessous, on se pose dessus par le haut, et bas + saut permet de redescendre à travers.
- Ils transportent le joueur posé dessus et lui transmettent leur vitesse quand il saute ou les quitte, avec quelques ticks de tolérance. Sauter au moment où ton fantôme saute doit donner un saut nettement plus haut : c'est la courte échelle, la technique reine du jeu.
- Ils ne te gênent et ne te blessent jamais. Si l'un d'eux te soulève contre un plafond, tu passes au travers.

### Les fantômes adverses

- Solides par les côtés et par-dessous. Ils poussent le joueur sur leur passage, et un joueur poussé prend la vitesse du fantôme : un fantôme en plein dash te projette.
- **Contact par le dessus** (tes pieds sur sa tête, que tu lui tombes dessus ou qu'il monte sous toi) : tu rebondis, plus haut si le saut est maintenu, ton dash se recharge, et ce fantôme devient intangible pour toi jusqu'à la fin de la manche. Il reste intact pour son propriétaire. Chaque joueur vit donc dans sa propre version de l'arène, ce qui garde la simulation entièrement locale.
- **Celui qui est au-dessus gagne.** Un fantôme adverse qui te tombe sur la tête alors que tu es au sol t'écrase.
- **Écrasement** (coincé entre un fantôme adverse et un mur, le sol ou un autre fantôme adverse) : KO. Prévois quelques pixels de tolérance pour tenter de dégager le joueur avant de le déclarer écrasé, sinon les morts paraîtront injustes.

### Garde-fous : jamais de situation sans issue

- **Sanctuaires.** Autour du départ et de l'objectif de chaque joueur, sur quelques tuiles, les fantômes adverses sont intangibles pour lui. Personne ne peut camper sur un départ ni s'asseoir sur un objectif. Ces zones sont dessinées au sol.
- **Superposition.** Un fantôme adverse qui deviendrait solide alors qu'il chevauche déjà le joueur (apparition, sortie d'un sanctuaire, fin d'invulnérabilité, départ partagé) reste intangible pour lui tant qu'ils ne se sont pas séparés.
- **Arènes.** Toujours au moins deux routes. La route de base ne passe jamais par un goulet où un fantôme planté ne pourrait être ni contourné ni piétiné : les goulets sont réservés aux raccourcis.

### KO

- Causes : écrasement, pics, chute hors de l'arène.
- Effet : 1 seconde hors jeu, puis retour au dernier sol ferme où le joueur s'est tenu (tuile fixe, hors danger), avec 0,5 seconde d'invulnérabilité. La punition doit piquer sans éliminer : en 15 secondes, renvoyer quelqu'un au départ reviendrait à lui retirer la manche.
- Dans l'enregistrement, le fantôme est absent pendant ce temps, puis réapparaît.

### Les autres vivants

Visibles en simple contour, intangibles. Ils ne servent qu'au suspense et à apprendre ce que l'autre prépare.

## 3. Personnage et sensations

Le contrôle du personnage passe avant tout le reste. Si courir et sauter dans une arène vide n'est pas déjà agréable, rien de ce qui suit ne sauvera le jeu.

- **Verbes** : courir, sauter (hauteur variable selon la durée d'appui), dash horizontal (un par envol, rechargé au sol et par rebond), descendre à travers une plateforme alliée. Pas de saut mural ni de dash vers le haut : la hauteur doit venir des fantômes, c'est ce qui donne sa valeur à la courte échelle.
- **Confort** : temps de coyote et tampon de saut d'environ 6 ticks chacun, gravité plus forte en descente qu'en montée, sommet de saut légèrement adouci, contrôle aérien franc, arrêt net au sol, correction de coin de quelques pixels.
- **Valeurs de départ, à régler** (1 = une tuile) : personnage d'environ 0,75 × 1,25 ; course à 9 tuiles par seconde atteinte en 0,1 seconde ; saut de 3,4 tuiles de haut pour 0,6 seconde en l'air ; dash de 4,5 tuiles en 0,15 seconde ; rebond équivalent à un saut plein, 4,5 tuiles si le saut est maintenu.
- **Retours** : écrasement et étirement du personnage, poussière à l'atterrissage, micro-arrêt sur image au rebond (2 ou 3 images), légère secousse d'écran désactivable, particules à l'apparition et à la disparition des fantômes, un son pour chaque action.
- **Entrées** : clavier lu par position physique des touches (`KeyboardEvent.code`), pour que ZQSD sur AZERTY et WASD sur QWERTY fonctionnent sans réglage, plus les flèches. Manette par la Gamepad API. Affiche les vraies lettres du clavier quand le navigateur donne la disposition, sinon montre les flèches. Proposition : déplacement aux flèches ou ZQSD, saut sur Espace ou Haut, dash sur Maj, X ou K (plusieurs touches, car cinq appuis d'affilée sur Maj déclenchent les touches rémanentes de Windows), émotes sur 1 à 4.

## 4. Arènes

Trois arènes au lancement, de caractères nettement différents : une arène d'apprentissage ouverte, une arène verticale à goulets, une arène avec du vide et des plateformes mobiles à cycle fixe.

Chaque arène doit offrir :

- une route de base faisable sans aucun fantôme en 9 à 10 secondes par un bon joueur, pour que la manche 1 soit jouable et que les 15 secondes laissent de la marge ;
- au moins deux raccourcis qui exigent un fantôme allié (une corniche d'environ une tuile trop haute pour un saut simple), pour un gain de 2 à 3 secondes ;
- un grand raccourci qui exige deux fantômes ou une courte échelle bien réglée, pour un gain de 4 à 5 secondes ;
- des goulets sur ces raccourcis (passage étroit, plafond bas, corniche d'une tuile de large) : c'est là qu'un corps adverse bloque vraiment, alors qu'en terrain ouvert un fantôme immobile se contourne ou sert de tremplin ;
- une zone centrale où les trajets se croisent, avec au moins deux passages ;
- peu de dangers, placés là où une poussée a des conséquences.

Format : des fichiers texte lisibles et modifiables à la main (une grille et quelques métadonnées). Ne décris que la moitié gauche, le moteur fabrique la droite par symétrie : l'équité est garantie par construction. Explique dans le README comment ajouter une arène.

## 5. Parcours et écrans

- **Accueil** : titre, pseudo (mémorisé), créer un salon, rejoindre avec un code, « Comment jouer ».
- **Salon** : lien à partager (adresse contenant un code court), joueurs présents, choix de couleur, bouton prêt. Réglages de l'hôte : arène, nombre de manches, dernière manche doublée. En attendant, chacun peut courir et sauter dans un petit terrain d'essai intégré au salon. L'hôte lance dès que deux joueurs sont prêts. Au-delà de quatre, les suivants sont spectateurs.
- **Comment jouer** : quatre vignettes animées, rendues par le vrai moteur si possible. Tes fantômes te portent. Ceux des autres te bloquent. Saute-leur sur la tête. Premier à l'objectif. Ajoute quelques astuces contextuelles pendant la première partie, désactivables.
- **Partie** : HUD minimal. Chrono large, lisible en vision périphérique, dont les 3 dernières secondes se sentent (son, pulsation). Manche en cours, scores.
- **Podium** : classement, trois ou quatre récompenses humoristiques tirées des statistiques de la partie (le fantôme le plus piétiné, le meilleur bouchon, la plus belle courte échelle, le temps record), et le « ballet final » : la dernière manche rediffusée en boucle avec tous les fantômes. Boutons : revanche (côtés échangés), changer d'arène, retour au salon.
- **Entraînement** : un joueur seul peut enchaîner les manches sur une arène. Ses fantômes s'accumulent, une touche remet tout à zéro.
- **Émotes** : quatre émotes rapides visibles par tous, y compris après avoir fini sa manche.
- **Réglages** : volume, secousses d'écran, plein écran, rappel des touches.
- **Aléas** : qui arrive en cours de partie est spectateur et jouera la suivante. Une déconnexion garde la place : reconnexion automatique grâce à un jeton en `localStorage`, avec resynchronisation complète. Si l'hôte part, le joueur suivant devient hôte. Rien n'attend jamais un absent : chaque état a un délai d'expiration.

## 6. Lisibilité

À quatre joueurs, la manche 6 met vingt fantômes à l'écran, plus les vivants. Le joueur doit lire d'un coup d'œil ce qui le concerne. Chaque statut a un traitement qui ne repose pas seulement sur la couleur :

| Ce que je vois | Ce que c'est pour moi | Rendu |
|---|---|---|
| Moi, vivant | — | Plein, net, le plus contrasté de l'écran |
| Mes fantômes | Plateforme traversante qui me porte | Ma couleur, translucide, dessus de la tête marqué comme une surface où se poser |
| Fantômes adverses | Solide qui pousse, rebond par le dessus | Plein, opaque, bord dur : il doit avoir l'air solide. Repère sur la tête |
| Fantôme adverse neutralisé | Rien jusqu'à la fin de la manche | Contour pointillé pâle |
| Vivants adverses | Rien | Simple contour : il doit avoir l'air intouchable |

En plus : numéro de manche sur chaque fantôme, bref éclat sur les fantômes nouveaux au départ, atténuation visible des fantômes adverses dans mes sanctuaires. Les spectateurs voient tous les fantômes pleins, aux couleurs des joueurs.

## 7. Identité

Le nom et la direction artistique sont à toi. La seule exigence : une vraie identité, c'est-à-dire un parti pris singulier, tenu partout, qu'on reconnaîtrait sur une seule capture d'écran.

« Fantômes » n'est qu'un nom de travail. Les fantômes eux-mêmes peuvent devenir autre chose dans ton univers (doublures, échos, reflets, copies, souvenirs…), tant que la fiction explique les règles : pourquoi mes passés m'aident, pourquoi ceux des autres me gênent, pourquoi on recommence.

Avant de dessiner quoi que ce soit, explore au moins trois directions vraiment différentes, choisis-en une et écris `IDENTITE.md` :

- le nom (court, facile à dire à voix haute en français, « on se fait un … ? », et qui n'est pas celui d'un jeu connu), une phrase d'accroche, et les pistes écartées avec la raison ;
- l'univers en trois phrases, et le vocabulaire du jeu qui en découle : comment s'appellent une manche, un fantôme, un KO, l'objectif ;
- le ton des textes, avec des exemples : messages de KO, annonces de manche, récompenses de fin ;
- la palette et le rôle de chaque couleur, dont quatre couleurs de joueurs distinguables par les daltoniens et doublées d'un signe de forme ou de motif ;
- la typographie : une police de titre et une police de texte, sous licence libre, embarquées dans le projet (les paquets npm Fontsource en fournissent) ;
- le personnage : une silhouette reconnaissable en très petit, et ses déclinaisons (vivant, fantôme allié, fantôme adverse, vivant adverse) ;
- les principes de mouvement et d'animation ;
- l'identité sonore.

Puis applique-la partout : logo, écran titre, salon, HUD, résultats, podium, page d'erreur, favicon, titre de l'onglet, et l'aperçu du lien quand on le colle dans une messagerie (balises Open Graph construites à partir de l'hôte de la requête, puisque l'adresse du tunnel peut changer, avec une image PNG générée par un script à la compilation).

À éviter : l'esthétique par défaut (dégradé violet, néon cyberpunk passe-partout, cartes arrondies génériques), les emojis en guise d'icônes, les polices système, le pixel art sans point de vue. La lisibilité du jeu prime toujours : en cas de conflit, c'est le style qui s'adapte.

Contraintes de production : tout est produit par le code. Formes vectorielles, SVG ou sprites définis dans le code, effets procéduraux. Le son aussi : bruitages et musique synthétisés avec Web Audio, sans fichier audio externe. Une idée à reprendre si elle te plaît : la musique gagne une couche à chaque manche, comme l'arène gagne des fantômes. Le son démarre au premier geste de l'utilisateur, se règle et se coupe, et le réglage est mémorisé.

Garde le nom du jeu dans une seule constante, pour qu'il soit facile à changer. Dans le code, utilise des identifiants neutres (`ghost`, `round`, `goal`), quel que soit le vocabulaire de l'univers.

## 8. Architecture et réseau

Recommandation, que tu peux adapter si tu as une meilleure raison (note-la) : TypeScript partout. Un cœur de simulation partagé, pur, sans DOM ni horloge, utilisable dans le navigateur et dans les tests. Client avec Vite et Canvas 2D, sans moteur de jeu ni framework d'interface. Serveur Node avec la bibliothèque `ws` : un seul processus qui sert le client compilé et le WebSocket sur le même port. État en mémoire, pas de base de données. Tests avec Vitest.

### Simulation

- Pas de temps fixe à 60 Hz, calé sur l'horloge de la manche : le tick courant vaut (maintenant − départ) × 60. Un client en retard (image longue, onglet en arrière-plan) simule d'un coup les ticks manquants, avec des entrées neutres au-delà d'une dizaine de ticks. Il ne joue jamais au ralenti, sinon une machine lente gagnerait du temps. Le rendu est interpolé pour les écrans à 120 ou 144 Hz.
- Espace logique fixe en 16:9, par exemple 640 × 360 avec des tuiles de 16 : une arène de 40 × 20 tuiles et une bande de 40 pixels pour l'interface. Le rendu est mis à l'échelle de la fenêtre : pixel art ou vectoriel, selon ton identité.
- Physique écrite à la main, en coordonnées entières, sur le modèle « acteurs et solides » décrit par Maddy Thorson pour Celeste et TowerFall : déplacement pixel par pixel avec reste fractionnaire, solides qui poussent et portent les acteurs, plateformes traversantes qui portent sans bloquer. Ce modèle donne des collisions exactes et rejouables, ce qu'un moteur physique généraliste ne garantit pas.
- Ordre d'un tick : 1) amener les éléments mobiles de l'arène et chaque fantôme à leur position de ce tick, en poussant ou en portant le joueur ; 2) mettre à jour le joueur (entrées, physique, collisions) ; 3) résoudre rebonds, dangers et objectif ; 4) enregistrer l'état du joueur pour ce tick.
- Si la position d'un fantôme saute d'un tick à l'autre (réapparition après un KO), ne balaie pas le trajet : fais-le disparaître puis réapparaître, en appliquant la règle de superposition.

### Réseau

Le principe : chaque client simule son propre joueur, en local, sans attendre personne. C'est possible parce que rien de ce qui se passe à distance pendant une manche ne peut changer ce que je vis : les fantômes sont des données connues d'avance et les autres vivants sont intangibles. Résultat : aucune latence ressentie, même à travers le tunnel, et ni prédiction ni rollback à écrire. Le serveur est l'arbitre du temps et du score, le dépôt des runs et un relais.

- Pendant la manche, chaque client envoie son run par petits paquets, toutes les 50 ms environ, avec tous les ticks. Le serveur les stocke (ce sera le fantôme) et les relaie aux autres, qui affichent le contour du joueur avec une centaine de millisecondes de retard interpolé.
- Départ synchronisé : le serveur annonce l'instant du départ au moins 3 secondes à l'avance, et les clients estiment leur décalage d'horloge par des pings réguliers.
- Le classement se fait au tick d'arrivée déclaré par chaque client, pas à l'heure de réception du message : la latence ne désavantage personne.
- Le serveur clôt la manche à 15 secondes plus une petite marge. Un run incomplet (déconnexion) devient un fantôme qui disparaît là où les données s'arrêtent.
- Avant chaque manche, le serveur vérifie que tous les clients possèdent tous les runs, avec un délai d'expiration.
- Battement de cœur applicatif toutes les 20 secondes environ. Il détecte les clients morts et garde la connexion en vie pendant les moments calmes du salon.
- Onglet en arrière-plan : le navigateur ralentit les minuteries. Au retour, le client rattrape l'horloge de la manche comme décrit plus haut : le joueur a perdu du temps, la partie ne l'a pas attendu.
- Messages de contrôle en JSON, typés dans le module partagé, avec un numéro de version du protocole. Échantillons de run en trames binaires compactes (section 9).

Pas d'anti-triche : c'est un jeu entre amis, le client est cru sur parole. En revanche, le serveur est exposé à Internet par le tunnel. Il valide donc la forme et la taille de tout ce qu'il reçoit, plafonne le nombre de salons, de joueurs par salon et la taille des messages, limite le débit par connexion, n'insère jamais un pseudo comme du HTML et ferme les salons vides.

## 9. Performances

Le jeu doit être léger et fluide sur un portable ordinaire, à travers le tunnel. Ces budgets se mesurent : chacun a son banc d'essai (section 11) et ses chiffres dans le rapport final.

- **Fluidité.** 60 images par seconde tenues dans le pire cas : 4 joueurs et 48 fantômes (10 manches plus 3 manches décisives). Budget : moins de 4 ms de script par image, simulation et rendu compris, et moins de 0,2 ms par tick de simulation.
- **Aucune allocation dans la boucle de jeu.** Ni par tick ni par image : runs stockés dans des tableaux typés, objets réutilisés, particules tirées d'une réserve plafonnée. Le décor fixe est dessiné une fois dans un canvas hors écran, puis recopié.
- **Rendu.** Un seul canvas de jeu, mis à l'échelle selon `devicePixelRatio`. Pas d'opération coûteuse à chaque image (ombres floues, filtres, mesure de texte) : ce qui peut être précalculé l'est. Menus en HTML et CSS.
- **Poids.** Moins de 300 Ko compressés pour tout le client, polices comprises (réduites aux caractères utiles). Aucune dépendance d'exécution côté client ; côté serveur, `ws` seulement. Fichiers à nom haché, précompressés à la compilation (Brotli et gzip) et servis avec un cache long ; la page HTML n'est pas mise en cache. Le salon s'affiche sans attendre ni les polices ni le son.
- **Réseau.** Runs en trames binaires, positions codées en différences. Budget : moins de 3 Ko par seconde envoyés par joueur pendant une course, moins de 10 Ko pour un run complet.
- **Serveur.** Il ne simule rien : il relaie et arbitre. Pas de boucle à 60 Hz, seulement des événements et quelques minuteries. Budget : moins de 100 Mo de mémoire avec dix salons actifs, processeur au repos entre les messages.
- **Image Docker.** Dépendances de production seulement, base Alpine ou distroless. Vise moins de 200 Mo.

N'optimise pas au-delà : pas de structure spatiale pour 48 boîtes, pas de WebGL, pas de worker, sauf si une mesure le réclame. Optimise ce que tu as mesuré, pas ce que tu supposes.

## 10. Docker et tunnel Cloudflare

- Un `Dockerfile` en plusieurs étapes : compilation, puis image d'exécution légère sur une version LTS de Node, utilisateur non root, `HEALTHCHECK` sur `/healthz`. Port 3000 par défaut, réglable par `PORT`.
- Un `docker-compose.yml` avec le service `game`, sans profil, qui publie le port sur la machine : `docker compose up -d --build` suffit pour jouer en local ou pour brancher un tunnel qui tourne déjà ailleurs (explique dans le README comment le faire pointer vers le jeu, y compris depuis un autre réseau Docker).
- Un service `cloudflared` (image officielle `cloudflare/cloudflared`), qui attend que `game` soit sain avant de démarrer, en deux profils :
  - **`quick`**, tunnel rapide sans compte ni domaine : `tunnel --no-autoupdate --url http://game:3000`. cloudflared écrit dans ses journaux une adresse aléatoire en `trycloudflare.com`. Fournis une commande ou un script qui l'extrait et l'affiche. À écrire dans le README : l'adresse change à chaque démarrage, il n'y a pas de garantie de disponibilité, la limite est de 200 requêtes simultanées et ce mode est prévu pour le test. L'option `--allowed-mail` permet de restreindre l'accès à certaines adresses e-mail : mentionne-la sans l'activer.
  - **`named`**, tunnel nommé à adresse stable sur un domaine : `tunnel --no-autoupdate run`, avec le jeton dans la variable `TUNNEL_TOKEN` lue depuis `.env` (fournis un `.env.example`). Le nom d'hôte public se configure dans le tableau de bord Cloudflare et pointe vers `http://game:3000`.
- Les WebSockets passent par Cloudflare sans configuration, mais une connexion restée muette trop longtemps est coupée : d'où le battement de cœur. N'utilise pas de Server-Sent Events, les tunnels rapides ne les prennent pas en charge.
- Le jeu ne dépend d'aucun nom d'hôte : chemins relatifs, `ws://` ou `wss://` déduit de l'adresse de la page, en-têtes `X-Forwarded-*` respectés. Il fonctionne tel quel sur `http://localhost:3000`.
- Aucune ressource n'est chargée depuis un CDN à l'exécution : polices et bibliothèques sont embarquées.
- Vérifie les options exactes de cloudflared dans la documentation actuelle avant d'écrire le fichier compose : elles évoluent.
- README : lancer chaque profil en une commande, récupérer l'adresse à partager, développer en local, ajouter une arène, rappel des touches, dépannage.

## 11. Vérification

Tu ne peux pas jouer clavier en main : donne-toi d'autres moyens de savoir que le jeu marche, et montre les preuves (sorties de commandes, chiffres, captures) au lieu d'affirmer.

- **Tests du cœur de simulation.** Un fantôme occupe exactement les positions enregistrées, tick par tick. Rejouer une même séquence d'entrées donne toujours la même trajectoire. Un joueur posé sur son fantôme reste dessus quand il bouge, et saute plus haut depuis un fantôme qui monte. Un fantôme allié qui soulève le joueur contre un plafond ne le bloque pas. Un fantôme adverse pousse. Pousser contre un mur met KO. Le contact par le dessus fait rebondir et rend le fantôme intangible jusqu'à la fin de la manche. Un fantôme adverse qui tombe sur un joueur au sol l'écrase. Sanctuaires et règle de superposition.
- **Test de robustesse.** Des milliers de ticks d'entrées aléatoires au milieu de fantômes aléatoires : le joueur ne finit jamais à l'intérieur d'une tuile ou d'un fantôme solide, ne sort jamais des limites, ne reste jamais coincé.
- **Runs de référence par arène.** Pour chaque arène, au moins deux séquences d'entrées rejouées par la vraie simulation : une qui atteint l'objectif sans aucun fantôme en moins de 11 secondes, et une qui emprunte un raccourci grâce à un fantôme allié posé par un premier run. Plus un test de symétrie de l'arène. C'est ce qui garantit que tes arènes sont faisables.
- **Test d'intégration du serveur.** De 2 à 4 clients simulés jouent une partie entière : salon, manches, distribution des fantômes, scores, manche doublée, manche décisive, et une déconnexion suivie d'une reconnexion en pleine partie. Deux variantes en plus : avec 300 ms de latence artificielle, la trajectoire locale d'un joueur ne change pas ; un client qui prend du retard rattrape l'horloge de la manche sans jouer au ralenti.
- **Bancs d'essai.** Un par budget de la section 9 : temps par tick et script par image dans le pire cas, poids du client après compilation, débit et taille d'un run, mémoire du serveur, taille de l'image. Un script les lance tous et échoue si un budget est dépassé.
- **Rendu.** Si tu disposes d'un navigateur sans interface (Playwright par exemple), capture chaque écran, regarde les images et corrige ce qui cloche. Fais tourner une partie complète à deux onglets automatisés.
- **Conteneur.** Construis l'image, lance le compose, interroge `/healthz`, joue une partie à travers le conteneur. Si le réseau le permet, lance le profil `quick` et vérifie qu'un WebSocket s'ouvre par l'adresse du tunnel.
- **Relecture indépendante.** Avant de conclure, fais relire le projet par un sous-agent au contexte vierge, avec ce brief pour seule référence. Il ne signale que ce qui touche le bon fonctionnement ou une exigence écrite. Corrige ces points, laisse le reste.

N'adapte jamais un test pour le faire passer, et ne contourne pas la vraie simulation dans les tests. Si un test révèle un défaut de règle ou d'arène, corrige la règle ou l'arène.

## 12. Méthode de travail et décisions

### Décider seul

- Ce brief ne tranche pas tout. Quand un point est flou, absent ou contradictoire, c'est toi qui choisis, sans interrompre le travail pour demander.
- Pour trancher, dans l'ordre : les trois piliers ; puis les priorités (sensations du personnage, lisibilité des fantômes, rythme entre les manches, performances, le reste) ; puis, à qualité égale, l'option la plus simple et la plus facile à défaire.
- Consigne chaque choix notable en une ligne dans `DECISIONS.md` : ce que tu as retenu, ce que tu as écarté, pourquoi.
- Les valeurs chiffrées des sections 2 à 4 sont des points de départ, à régler par la simulation et la mesure. Une règle peut changer si elle se joue mal, tant que les trois piliers tiennent et que le changement est noté. Les budgets de la section 9 sont à tenir : si l'un d'eux se révèle irréaliste, garde ta meilleure mesure et explique l'écart dans le rapport.
- Ce que moi seul peux fournir (jeton Cloudflare, nom de domaine) ne te bloque pas : construis tout autour, documente l'étape manuelle dans le README et vérifie avec le tunnel rapide.
- Si ton environnement empêche une vérification (pas de Docker, pas de réseau sortant, pas de navigateur), fais tout le reste et signale-le dans le rapport, sans prétendre l'avoir faite.
- Tu t'arrêtes quand la section 13 est remplie. Pas de point d'étape qui attend une réponse.

### Jalons

Commence par un plan court, sans attendre de validation, puis avance par jalons. À la fin de chaque jalon : tests au vert et un commit (initialise le dépôt git s'il n'existe pas).

1. Identité et plan (`IDENTITE.md`).
2. Cœur de simulation et contrôle du personnage, avec ses tests, son banc d'essai et un bac à sable dans le navigateur.
3. Boucle des fantômes en solo : enregistrement, relecture, fantômes alliés et adverses, mode entraînement.
4. Multijoueur : serveur, salons, synchronisation, score, résultats, reconnexion.
5. Arènes et réglages : trois arènes, runs de référence, équilibrage.
6. Identité appliquée et finitions : rendu, son, tous les écrans, podium, émotes.
7. Budgets de performance, Docker, tunnel, documentation, vérification de bout en bout, relecture indépendante.

### Conventions

- Code et commentaires en anglais. Textes du jeu en français, regroupés dans un seul fichier.
- Tiens à jour un `CLAUDE.md` court (commandes, architecture, conventions) et un `AVANCEMENT.md` (jalon en cours, reste à faire, problèmes connus), pour qu'une nouvelle session reprenne sans rien redécouvrir.
- Termine par un rapport : ce qui est livré, ce que tu as vérifié avec les preuves, les mesures de la section 9, ce que tu n'as pas pu vérifier, les décisions qui méritent mon attention et la commande pour lancer le jeu.

## 13. Terminé quand

Chaque point se prouve par une commande ou une capture dont tu montres le résultat.

- [ ] `docker compose up -d --build` lance le jeu seul sur `http://localhost:3000`.
- [ ] `docker compose --profile quick up -d --build` démarre le jeu et le tunnel, et l'adresse à partager s'obtient en une commande.
- [ ] Deux à quatre clients automatisés jouent une partie complète, du salon au podium, puis une revanche : à travers le conteneur, et à travers le tunnel si le réseau le permet.
- [ ] Le joueur local est simulé sans attendre le réseau : le test à 300 ms de latence passe.
- [ ] Les fantômes rejouent à l'identique chez tous les clients : un test compare leurs positions tick par tick.
- [ ] Chaque règle de la section 2 est couverte par un test, et tous les tests passent.
- [ ] Les trois arènes ont leurs runs de référence au vert.
- [ ] Les budgets de la section 9 sont mesurés et tenus, chiffres à l'appui.
- [ ] Une déconnexion en cours de partie se rattrape sans bloquer les autres.
- [ ] `IDENTITE.md` existe et l'identité est appliquée à tous les écrans, sans élément provisoire.
- [ ] Le README permet à quelqu'un qui découvre le projet de le lancer : en local, en tunnel rapide et en tunnel nommé.
- [ ] `DECISIONS.md` liste les choix faits sans moi, et le rapport final est écrit.

## 14. Hors périmètre, et bonus

Hors périmètre : comptes, base de données, matchmaking public, anti-triche, discussion écrite ou vocale, commandes tactiles (sur mobile, afficher un message soigné qui invite à passer sur ordinateur).

Bonus, seulement si tout ce qui précède est solide :

- équipes en 2 contre 2, où les fantômes des coéquipiers sont des alliés ;
- un adversaire d'entraînement construit à partir des runs de référence, pour s'exercer seul contre des fantômes adverses ;
- commandes tactiles.
