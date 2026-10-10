import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_NAME } from '../shared/name';
import { createServer } from './server';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const root = process.env.STATIC_DIR || resolve(here, '../client');

const server = await createServer({ port, root });
console.log(`${GAME_NAME} — http://localhost:${server.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void server.close().then(() => process.exit(0)));

// STATS=1: prints memory and CPU time every two seconds (used by the benchmark).
if (process.env.STATS) setInterval(() => console.log('stats ' + JSON.stringify({ rss: process.memoryUsage().rss, cpu: process.cpuUsage(), rooms: server.rooms.size })), 2000);
