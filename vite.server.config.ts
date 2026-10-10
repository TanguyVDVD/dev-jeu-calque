import { defineConfig } from 'vite';

// The server is bundled into a single file (ws included) so the runtime image needs no node_modules.
export default defineConfig({
  build: { ssr: 'src/server/main.ts', outDir: 'dist/server', emptyOutDir: true, target: 'node20' },
  ssr: { noExternal: true },
});
