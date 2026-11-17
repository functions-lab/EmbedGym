import { defineConfig, type Plugin, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

import { readBench } from './load_bench';
import { handleApi } from './api';
import { readWorkspace } from './load_workspace';

// Results live outside the vite root and change while the page is open, so the
// preview server reads them on each request instead of serving them as files.
//   /__bench                        dashboard rows and host status
//   /api                            JSON API for agents on other hosts; GET /api lists its endpoints
//   /__workspace?ws=results/bench/… one workspace with its trajectories
//   /__download?sel=<target>/<model>… zip of each pair's workspaces in every mode
export default defineConfig(() => {
  const testbench = path.resolve(__dirname, '..');
  const bench = path.join(testbench, 'results', 'bench');

  function json(res: any, body: unknown) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  function serveResults(server: PreviewServer) {
    server.middlewares.use('/__bench', (_req, res) => json(res, readBench(testbench)));
    server.middlewares.use('/api', (req, res) => {
      const [status, body] = handleApi(testbench, req.url!);
      res.statusCode = status;
      json(res, body);
    });
    server.middlewares.use('/__workspace', (req, res) => {
      const ws = new URL(req.url!, 'http://x').searchParams.get('ws') ?? '';
      const dir = path.resolve(testbench, ws);
      if (!dir.startsWith(bench + path.sep) || !fs.existsSync(path.join(dir, 'results'))) {
        res.statusCode = 404;
        res.end(`no workspace under results/bench: ${ws}`);
        return;
      }
      json(res, readWorkspace(dir));
    });
    server.middlewares.use('/__download', (req, res) => {
      const sels = new URL(req.url!, 'http://x').searchParams.getAll('sel');
      const dirs: string[] = [];
      for (const sel of sels) {
        const [target, model, ...rest] = sel.split('/');
        const names = [target, model];
        if (rest.length || names.some((n) => !n || n === '.' || n === '..')) {
          res.statusCode = 400;
          res.end(`bad selection: ${sel}`);
          return;
        }
        const found = fs.readdirSync(path.join(bench, target))
          .map((mode) => `${target}/${mode}/${model}`)
          .filter((d) => fs.existsSync(path.join(bench, d)));
        if (!found.length) {
          res.statusCode = 404;
          res.end(`no workspace for ${sel}`);
          return;
        }
        dirs.push(...found);
      }
      if (!dirs.length) {
        res.statusCode = 400;
        res.end('nothing selected');
        return;
      }
      const name = sels.length === 1 ? sels[0].replace('/', '_') : 'embedgym-results';
      res.setHeader('content-type', 'application/zip');
      res.setHeader('content-disposition', `attachment; filename="${name}.zip"`);
      const zip = spawn('zip', ['-qr', '-', ...dirs, '-x', '*/solution/build/*', '*.lock'], { cwd: bench });
      zip.stdout.pipe(res);
      zip.stderr.on('data', (d) => server.config.logger.warn(`zip: ${d}`));
      // Headers are already sent, so a failed zip can only abort the transfer.
      zip.on('close', (code) => { if (code !== 0) res.destroy(new Error(`zip exited ${code}`)); });
      res.on('close', () => { if (!res.writableFinished) zip.kill(); });
    });
  }

  const resultsApi: Plugin = {
    name: 'embedgym-results',
    configurePreviewServer: serveResults,
  };

  return {
    root: __dirname,
    preview: { port: 5177, strictPort: true },
    plugins: [react(), resultsApi],
  };
});
