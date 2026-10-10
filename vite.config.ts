import { defineConfig, type Plugin } from 'vite';
import { GAME_NAME, PITCH, TAGLINE } from './src/shared/name';
import { logoSvg } from './src/shared/logo';
import { TX } from './src/client/texts';

// The static pages take their words from the same constants as the game.
const words: Record<string, string> = { NAME: GAME_NAME, TAGLINE, PITCH, NOTFOUND: TX.notFound[0], BACKHOME: TX.notFound[1], LOGO: logoSvg() };
const page: Plugin = { name: 'page-words', transformIndexHtml: (html) => html.replace(/%([A-Z]+)%/g, (m, k) => words[k] ?? m) };

export default defineConfig({
  root: 'src/client',
  plugins: [page],
  build: {
    outDir: '../../dist/client', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0,
    rollupOptions: { input: { index: 'src/client/index.html', notfound: 'src/client/404.html' } },
  },
  server: { proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } } },
  test: { root: '.', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as any);
