import { defineConfig } from 'vite';

// The server is bundled into a single file (ws included) so the runtime image needs no node_modules.
export default defineConfig({
  build: { ssr: 'src/server/main.ts', outDir: 'dist/server', emptyOutDir: true, target: 'node20' },
  ssr: { noExternal: true },
  // ws probes two optional native add-ons with require(); a bundle cannot carry them, so tell ws not to look.
  define: { 'process.env.WS_NO_BUFFER_UTIL': '"1"', 'process.env.WS_NO_UTF_8_VALIDATE': '"1"' },
});
