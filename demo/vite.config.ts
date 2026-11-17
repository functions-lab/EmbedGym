import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

import { embedGymParts } from '../parts/vite-plugin';

import { readCatalog, DEMO_TARGET } from './data/load_catalog';
import { readWorkspaces } from './data/load_runs';

const REPO_ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(REPO_ROOT, 'velxio', 'frontend');
const BENCH = REPO_ROOT;

// The catalog, injected as one module; /__reload re-reads it without a restart.
//
// Circuits need their own module: they are TS that vite must compile, and they
// sit outside this root, where `import.meta.glob` silently matches nothing. So
// emit dynamic imports by absolute path instead.
function catalogPlugin(): Plugin {
  const load = () => ({ ...readCatalog(BENCH), workspaces: readWorkspaces(BENCH) });

  const circuitsModule = () => {
    const entries = readCatalog(BENCH).tasks.map((t) => {
      const file = path.join(BENCH, 'tasks', t.name, DEMO_TARGET, 'circuit.ts');
      return `  ${JSON.stringify(t.name)}: () => import(${JSON.stringify(file)}),`;
    });
    return `export default {\n${entries.join('\n')}\n};`;
  };

  return {
    name: 'embedgym-demo-data',
    resolveId(id) {
      return id === 'virtual:embedgym-demo-data' || id === 'virtual:embedgym-circuits' ? id : null;
    },
    load(id) {
      if (id === 'virtual:embedgym-circuits') return circuitsModule();
      if (id !== 'virtual:embedgym-demo-data') return null;
      return `export default ${JSON.stringify(load())};`;
    },
    configureServer(server) {
      server.middlewares.use('/__reload', (_req, res) => {
        const mod = server.moduleGraph.getModuleById('virtual:embedgym-demo-data');
        if (mod) server.moduleGraph.invalidateModule(mod);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(load()));
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  define: {
    __EMBEDGYM_DEMO_TARGET__: JSON.stringify(DEMO_TARGET),
  },
  server: {
    port: 5178,
    // The demo reaches outside its root; the ngspice worker 403s without this.
    fs: { allow: [REPO_ROOT] },
    // Compile only. Point EMBEDGYM_API_PORT at a backend that has arduino-cli — the
    // sim container answers on 8001 but never compiles.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.EMBEDGYM_API_PORT ?? '8001'}`,
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), embedGymParts(), catalogPlugin()],
  // components-metadata.json, component-svgs/, boards/.
  publicDir: path.join(FRONTEND, 'public'),
  resolve: {
    alias: {
      '@pro': path.join(FRONTEND, 'src', '__pro_stub__'),
      '@velxio': path.join(FRONTEND, 'src'),
      '@harness': path.join(BENCH, 'harness'),
      '@tasks': path.join(BENCH, 'tasks'),
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: { include: ['avr8js', 'rp2040js', '@wokwi/elements'] },
});
