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
