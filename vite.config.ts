import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  build: { outDir: '../../dist/client', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0 },
  server: { proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } } },
  test: { root: '.', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as any);
