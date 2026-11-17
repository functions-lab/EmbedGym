import fs from 'node:fs';
import path from 'node:path';
import { searchForWorkspaceRoot, type Plugin } from 'vite';

const PARTS_DIR = __dirname;
const SVG_DIR = path.join(PARTS_DIR, 'elements/svgs');

/**
 * Wires these parts into a velxio build: the `@parts` alias velxio's seams
 * import, and our component SVGs served at /component-svgs/ beside velxio's own
 * public ones.
 */
export function embedGymParts(): Plugin {
  return {
    name: 'embedgym-parts',
    // Vite drops its default allow list (the workspace root) once any allow
    // list is given, so keep it when the host config sets none.
    config: (config) => ({
      resolve: { alias: { '@parts': PARTS_DIR } },
      server: {
        fs: {
          allow: config.server?.fs?.allow
            ? [PARTS_DIR]
            : [searchForWorkspaceRoot(config.root ?? process.cwd()), PARTS_DIR],
        },
      },
    }),
    configureServer(server) {
      server.middlewares.use('/component-svgs', (req, res, next) => {
        const file = path.join(SVG_DIR, path.basename(req.url ?? ''));
        if (!fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      for (const name of fs.readdirSync(SVG_DIR)) {
        this.emitFile({ type: 'asset', fileName: `component-svgs/${name}`, source: fs.readFileSync(path.join(SVG_DIR, name)) });
      }
    },
  };
}
