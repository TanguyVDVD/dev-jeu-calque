// Control messages (JSON) shared by server and client. Run samples travel as binary frames (codec.ts).
export const PROTOCOL = 1;

export const MAX_SEATS = 4, MAX_SPECTATORS = 8, MAX_ROOMS = 50, MAX_MSG = 6000, NAME_MAX = 14;
export const MIN_ROUNDS = 4, MAX_ROUNDS = 10, MAX_TIEBREAKS = 3;
export const AUTO_ROUNDS = [8, 8, 8, 7, 6]; // by number of players

// All durations in milliseconds of game time.
export const T = {
  COUNTDOWN: 3000, // players frozen at the start
  ROUND: 15000,
  GRACE: 1500, // slack after 15 s before the server closes a round on its own
  RESULTS: 3600,
  HAVE: 2000, // extra wait for clients that have not confirmed they hold every run
  PING: 5000, // application heartbeat (well under Cloudflare's idle cut)
  DEAD: 30000, // a silent connection is dropped
  REJOIN: 3000, // a player who just dropped mid-round is still waited for this long (network blips)
  LOBBY_SEAT: 20000, // a disconnected player keeps their seat in the lobby this long
  EMPTY: 30000, // a room with nobody connected is closed
  PODIUM: 180000, // then back to the lobby
};

export const ROUND_NORMAL = 0, ROUND_DOUBLE = 1, ROUND_TIEBREAK = 2;

export interface PlayerInfo { id: number; name: string; color: number; ready: boolean; on: boolean; seat: number }
export type Phase = 'lobby' | 'round' | 'results' | 'podium';

export interface RoundMsg {
  t: 'round'; n: number; total: number; kind: number; startAt: number; arena: number;
  seats: { seat: number; side: number }[];
  scores: number[];
  you?: { len: number; done: boolean }; // only on resync: what the server already holds of my run
}
export interface ResultsMsg {
  t: 'results'; n: number; kind: number;
  rows: { seat: number; tick: number; pts: number }[]; // tick = -1: did not reach the goal
  scores: number[]; next: 'round' | 'tiebreak' | 'podium';
}
export interface Award { k: 'stomped' | 'blocker' | 'ladder' | 'fastest' | 'erased'; seat: number; round: number; v: number }
export interface PodiumMsg { t: 'podium'; rank: number[]; winners: number[]; scores: number[]; awards: Award[]; rounds: number; arena: number }

export type ServerMsg =
  | { t: 'hi'; v: number; id: number; token: string; code: string }
  | { t: 'room'; code: string; host: number; phase: Phase; arena: number; rounds: number; double: boolean; players: PlayerInfo[] }
  | RoundMsg | ResultsMsg | PodiumMsg
  | { t: 'emote'; seat: number; e: number }
  | { t: 'pong'; c: number; s: number }
  | { t: 'err'; code: 'version' | 'nocode' | 'full' | 'rooms' | 'bad' };

export type ClientMsg =
  | { t: 'join'; v: number; name: string; code?: string; token?: string }
  | { t: 'set'; name?: string; color?: number; ready?: boolean; arena?: number; rounds?: number; double?: boolean }
  | { t: 'start' } | { t: 'rematch' } | { t: 'lobby' } | { t: 'leave' }
  | { t: 'done'; n: number; tick: number; st: number[]; cr: number[]; ld: number; ko: number }
  | { t: 'have'; n: number }
  | { t: 'emote'; e: number }
  | { t: 'ping'; c: number };

// WebSocket close code: this seat was taken over by a newer connection with the same token. Do not reconnect.
export const CLOSE_REPLACED = 4001;

// A ghost is identified across clients by its round (1-based) and seat.
export const ghostId = (round: number, seat: number) => (round - 1) * MAX_SEATS + seat;

// Never trusted as HTML anywhere; this only keeps names short and printable.
export function cleanName(v: unknown): string {
  const s = (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NAME_MAX);
  return s || 'Anonyme';
}
