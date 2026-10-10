// One process, one port: static client (precompressed, long cache), /healthz, and the WebSocket.
// Exposed to the Internet through a tunnel: everything received is size-capped, rate-limited and shape-checked.
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { realClock, type Clock } from '../shared/clock';
import { MAX_ROOMS, MAX_MSG, PROTOCOL, T, type ClientMsg } from '../shared/protocol';
import { Room, type Conn, type Player } from './room';

export interface ServerOpts { port?: number; root?: string; clock?: Clock }
export interface Server { port: number; rooms: Map<string, Room>; close(): Promise<void> }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
};
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels: no accidental words, nothing to mishear
const KNOWN = new Set(['set', 'start', 'rematch', 'lobby', 'leave', 'done', 'have', 'emote']);
const MAX_SOCKETS = 800, BUCKET = 120, REFILL_PER_S = 60;

interface File { body: Buffer; br?: Buffer; gz?: Buffer; type: string }

export function createServer(opts: ServerOpts = {}): Promise<Server> {
  const clock = opts.clock ?? realClock();
  const root = opts.root && existsSync(opts.root) ? normalize(opts.root) : null;
  const rooms = new Map<string, Room>();
  const cache = new Map<string, File | null>();

  const load = (rel: string): File | null => {
    if (!root) return null;
    let f = cache.get(rel);
    if (f !== undefined) return f;
    const path = normalize(join(root, rel));
    f = null;
    if (path.startsWith(root + sep) && existsSync(path) && TYPES[extname(path)]) {
      f = { body: readFileSync(path), type: TYPES[extname(path)] };
      if (existsSync(path + '.br')) f.br = readFileSync(path + '.br');
      if (existsSync(path + '.gz')) f.gz = readFileSync(path + '.gz');
    }
    cache.set(rel, f);
    return f;
  };

  // The public address is whatever the request says it is (the tunnel's hostname can change).
  const origin = (req: IncomingMessage): string => {
    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v ?? '').split(',')[0].trim();
    const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
    const proto = first(req.headers['x-forwarded-proto']) === 'https' ? 'https' : 'http';
    return /^[a-zA-Z0-9.:[\]-]{1,255}$/.test(host) ? `${proto}://${host}` : '';
  };

  const page = (req: IncomingMessage, res: ServerResponse, rel: string, status: number) => {
    const f = load(rel);
    if (!f) { res.writeHead(status === 200 ? 404 : status, { 'content-type': 'text/plain; charset=utf-8' }).end('404'); return; }
    res.writeHead(status, { 'content-type': f.type, 'cache-control': 'no-cache' }).end(f.body.toString('utf8').replaceAll('__ORIGIN__', origin(req)));
  };

  const http = createHttp((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('ok'); return; }
    if (url === '/' || /^\/r\/[A-Za-z]{4}$/.test(url)) return page(req, res, 'index.html', 200);
    const f = /^\/[\w./-]+$/.test(url) && !url.includes('..') ? load(url.slice(1)) : null;
    if (!f || url.endsWith('.html')) return page(req, res, '404.html', 404);
    const enc = String(req.headers['accept-encoding'] ?? '');
    const head: Record<string, string> = { 'content-type': f.type, vary: 'accept-encoding', 'cache-control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' };
    let body = f.body;
    if (f.br && /\bbr\b/.test(enc)) { body = f.br; head['content-encoding'] = 'br'; }
    else if (f.gz && /\bgzip\b/.test(enc)) { body = f.gz; head['content-encoding'] = 'gzip'; }
    res.writeHead(200, head).end(req.method === 'HEAD' ? undefined : body);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MSG });
  const seen = new Map<WebSocket, number>();

  const newCode = (): string => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  };

  wss.on('connection', (ws) => {
    if (wss.clients.size > MAX_SOCKETS) { ws.close(1013); return; }
    let room: Room | null = null, player: Player | null = null;
    let tokens = BUCKET, last = Date.now();
    const conn: Conn = { send: (d) => { if (ws.readyState === ws.OPEN) ws.send(d); }, close: () => ws.close() };
    const say = (o: object) => conn.send(JSON.stringify(o));
    seen.set(ws, Date.now());

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      const now = Date.now();
      tokens = Math.min(BUCKET, tokens + ((now - last) / 1000) * REFILL_PER_S) - 1; last = now;
      if (tokens < 0) { ws.close(1008); return; }
      seen.set(ws, now);
      if (isBinary) { if (room && player) room.onFrame(player, new Uint8Array(data.buffer, data.byteOffset, data.length)); return; }
      let m: ClientMsg;
      try { m = JSON.parse(data.toString('utf8')); } catch { return; }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      if (m.t === 'ping') { if (typeof m.c === 'number') say({ t: 'pong', c: m.c, s: clock.now() }); return; }
      if (m.t === 'join') {
        if (player) return;
        if (m.v !== PROTOCOL) return say({ t: 'err', code: 'version' });
        const code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
        let r = rooms.get(code);
        if (code && !r) return say({ t: 'err', code: 'nocode' });
        if (!r) {
          if (rooms.size >= MAX_ROOMS) return say({ t: 'err', code: 'rooms' });
          const c = newCode();
          r = new Room(c, clock, () => rooms.delete(c));
          rooms.set(c, r);
        }
        const p = r.join(conn, m.name, m.token);
        if (!p) return say({ t: 'err', code: 'full' });
        room = r; player = p;
        return;
      }
      if (room && player && KNOWN.has(m.t)) room.onMessage(player, m);
    });
    ws.on('close', () => { seen.delete(ws); if (room && player) room.drop(player, conn); });
    ws.on('error', () => ws.terminate());
  });

  // Dead-connection sweep: the only periodic timer of the server.
  const sweep = setInterval(() => {
    const limit = Date.now() - T.DEAD;
    for (const [ws, t] of seen) if (t < limit) ws.terminate();
  }, 10000);
  sweep.unref();

  return new Promise((resolve) => {
    http.listen(opts.port ?? 0, () => {
      const addr = http.address();
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : 0,
        rooms,
        close: () => new Promise<void>((done) => {
          clearInterval(sweep);
          for (const r of [...rooms.values()]) r.close();
          for (const ws of wss.clients) ws.terminate();
          wss.close(() => http.close(() => done()));
        }),
      });
    });
  });
}
