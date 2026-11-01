import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The MCP App view: one self-contained HTML file, since the host renders it in a sandbox with no origin of its own. */
export default defineConfig({
  root: here('.'),
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@': here('../..'),
    },
  },
  build: {
    outDir: here('../../../mcp-dist'),
    emptyOutDir: true,
    rollupOptions: { input: here('./month-end.html') },
  },
});
