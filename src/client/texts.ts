// Every word the game says, in one place. Vocabulary and tone: see IDENTITE.md.
import { GAME_NAME, TAGLINE } from '../shared/name';
import type { Award } from '../shared/protocol';

const secs = (ticks: number) => (ticks / 60).toFixed(2).replace('.', ',') + ' s';

export const TX = {
  name: GAME_NAME, tagline: TAGLINE,
  colors: ['Bleu', 'Vermillon', 'Vert', 'Mauve'],
  emotes: ['Ha !', 'Oups', 'Bien vu', 'Revanche !'],

  home: {
    pseudo: 'Ton nom', pseudoHint: 'Ada, Bob, Zoé…',
    create: 'Ouvrir un atelier', join: 'Rejoindre', code: 'Code', codeHint: 'ABCD',
    training: 'Brouillon', trainingHint: 'Seul, pour apprendre une planche.',
    howto: 'Comment jouer', settings: 'Réglages',
    pitch: 'Des feuilles de 15 secondes. Tout ce que tu traces reste, et rejoue à la suivante.',
  },
  lobby: {
    title: "L'atelier", link: 'Le lien à partager', copy: 'Copier', copied: 'Copié',
    players: 'Autour de la table', spectator: 'regarde', host: 'hôte', away: 'parti', you: 'toi',
    color: 'Ta couleur', ready: 'Prêt', notReady: 'Pas prêt', readyMark: 'prêt',
    settings: 'La partie', arena: 'Planche', rounds: 'Feuilles', auto: 'auto', double: 'Dernière doublée',
    start: 'Lancer', needTwo: 'Il faut deux joueurs prêts.', waitHost: "L'hôte lance quand deux joueurs sont prêts.",
    sandbox: "Terrain d'essai — cours, saute, dashe en attendant.", leave: 'Quitter',
    spectating: 'La table est pleine ou la partie est en cours : tu regardes, et tu joues la suivante.',
  },
  howto: {
    title: 'Comment jouer',
    cards: [
      ['Tes tracés te portent', 'Tout ce que tu as fait aux feuilles précédentes rejoue. Monte sur ta propre tête.'],
      ['Ceux des autres te bloquent', "L'encre des autres est sèche : elle barre la route, pousse, et peut te coincer."],
      ['Saute-leur sur la tête', "Tu rebondis, et ce tracé n'existe plus pour toi jusqu'à la fin de la feuille."],
      ['Premier à la mire', "3 points au premier, 1 point à ceux qui arrivent. Qui n'arrive pas laisse un tracé de 15 secondes."],
    ],
    keys: 'Les touches', move: 'Bouger', jump: 'Sauter', dash: 'Dash', drop: 'Traverser un de tes tracés', dropKeys: 'Bas + saut',
    emote: 'Un mot aux autres', emoteKeys: '1 2 3 4', pad: 'Une manette fonctionne aussi.',
    back: 'Retour',
  },
  settings: {
    title: 'Réglages', volume: 'Volume', shake: "Secousses d'écran", tips: 'Astuces pendant la partie',
    fullscreen: 'Plein écran', close: 'Fermer', on: 'oui', off: 'non',
  },
  hud: {
    round: (n: number, total: number) => (n > total ? 'Départage' : `Feuille ${n} / ${total}`),
    training: (n: number) => `Brouillon — feuille ${n}`,
    trainingKeys: 'R : tout effacer · Échap : menu',
    spectator: 'Tu regardes',
    reconnecting: 'Connexion perdue. On recolle la feuille…',
  },
  announce: (n: number, total: number, kind: number) =>
    kind === 2 ? 'Feuille de départage.' : kind === 1 ? 'Dernière feuille. Elle compte double.' : n === 1 ? 'Feuille 1 — page blanche.' : n === total ? 'Dernière feuille.' : n >= 4 ? `Feuille ${n}. Ça commence à être chargé.` : `Feuille ${n}.`,
  go: 'Trace !',
  ko: { crush: "Coincé contre l'encre.", spike: 'Les pointes, ça ne pardonne pas.', fall: 'Hors de la feuille.' },
  stomped: 'Estompé.',
  finished: (ticks: number) => `À la mire en ${secs(ticks)}.`,
  results: {
    title: (n: number, kind: number) => (kind === 2 ? 'Départage' : `Feuille ${n}`),
    first: 'Premier à la mire', dnf: 'pas arrivé', points: (p: number) => (p ? `+${p}` : '0'),
    delta: (d: number) => (d < 0 ? '-' : '+') + secs(Math.abs(d)),
    nextRound: 'Feuille suivante…', nextTie: 'Égalité en tête : feuille de départage…', nextPodium: 'On range les crayons…',
    time: secs,
  },
  podium: {
    title: 'Le rendu', winner: (name: string) => `${name} signe la planche.`, shared: 'Victoire partagée.',
    rematch: 'Revanche', rematchHint: 'côtés échangés', lobby: "Retour à l'atelier", arena: 'Changer de planche',
    waitHost: "L'hôte décide de la suite.", ballet: 'Le ballet final', points: (p: number) => `${p} pts`,
  },
  award(a: Award, name: string): [string, string] {
    switch (a.k) {
      case 'stomped': return ['Le paillasson', `${name} — son tracé n° ${a.round} a été estompé ${a.v} fois.`];
      case 'blocker': return ['Le bouchon', `${name} — son tracé n° ${a.round} a gommé ${a.v} fois.`];
      case 'ladder': return ['La courte échelle', `${name} — ${a.v} appuis sur ses propres tracés.`];
      case 'fastest': return ['Le trait le plus vif', `${name} — ${secs(a.v)} à la feuille ${a.round}.`];
      default: return ["La gomme d'or", `${name} — gommé ${a.v} fois.`];
    }
  },
  tips: [
    "Va jusqu'à la mire d'en face. C'est tout.",
    'Ton tracé de la feuille 1 rejoue : arrête-toi une seconde au pied d’une corniche trop haute.',
    'Monte sur ta propre tête. Saute en même temps que ton tracé : tu montes bien plus haut.',
    "L'encre des autres te barre la route ? Saute-leur sur la tête.",
    'Ne pas arriver laisse un tracé de 15 secondes. Un bouchon bien placé vaut parfois une feuille.',
  ],
  errors: {
    nocode: "Cet atelier n'existe pas, ou plus.", full: 'Cet atelier est complet.', rooms: 'Trop d’ateliers ouverts. Réessaie dans un instant.',
    taken: 'Cette place vient de rouvrir dans un autre onglet.',
    version: 'Recharge la page : le jeu a changé de version.', bad: 'Message refusé.',
  },
  mobile: ['Il faut un clavier.', `${GAME_NAME} se joue à la course et au saut, au pixel près. Ouvre ce lien sur un ordinateur.`],
  notFound: ["Cette feuille n'existe pas.", "Retour à l'accueil"],
};
