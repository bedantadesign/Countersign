import path from 'node:path';

const here = path.resolve('e2e/mcp-host');
export const HOST_FILE = path.resolve('node_modules/.cache/mcp-host/host.html');

/** Playwright global setup: bundle the test chat host into one HTML file. Paths are from the repo root. */
export default async function buildHost() {
  const { build } = await import('vite');
  const { viteSingleFile } = await import('vite-plugin-singlefile');
  await build({
    configFile: false,
    logLevel: 'warn',
    root: here,
    plugins: [viteSingleFile()],
    build: {
      outDir: path.dirname(HOST_FILE),
      emptyOutDir: true,
      rollupOptions: { input: path.join(here, 'host.html') },
    },
  });
}
