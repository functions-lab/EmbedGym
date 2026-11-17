import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { embedGymParts } from '../parts/vite-plugin';
import path from 'node:path';
import fs from 'node:fs';
import targets from './targets.json';
import serialConfig from './serial_config.json';

// run.sh sets EMBEDGYM_TASK to the task directory and EMBEDGYM_TARGET to the selected
// target (a benchmark `pinout` key, e.g. `atmega2560_arduino`). The task's
// test.jsonl is shared by every target — circuit rows carry a `target` and the
// runner keeps the selected one's. Everything per-target lives in
// <task>/<target>/: circuit.ts (aliased to `@circuit`) and the build artifact,
// unless EMBEDGYM_FIRMWARE names another one (run.sh --firmware, grading an LLM's
// solution).
//
// EMBEDGYM_SERIAL_MS switches the runner into serial mode (run.sh --serial-ms): run
// the sim that many simulated ms, collect Serial, assert nothing. EMBEDGYM_ACTIONS
// names an action script to run during it (run.sh --actions).
//
// A network task's <target>/peer.py is loaded from under tasks/ or selftests/,
// at the same relative path; the page gets the task dir relative to the repo
// root. On the ESP32-S3 targets esp_cloud loads it (it
// mounts only those two dirs): the /embedgym-cloud proxy to EMBEDGYM_CLOUD_BASE adds
// EMBEDGYM_CLOUD_TOKEN, so the page never holds the token (a VITE_* name would put
// it in import.meta.env). On the nRF52840 targets the backend's worker loads it
// once the WS start payload carries EMBEDGYM_CLOUD_TOKEN, so the page holds the token:
// vite serves it on localhost only, as the virtual:embedgym-peer-token module.
const SERIAL_MS_CAP = serialConfig.max_ms;

function serialMs(): number | null {
  const raw = process.env.EMBEDGYM_SERIAL_MS;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`EMBEDGYM_SERIAL_MS must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  if (n > SERIAL_MS_CAP) {
    throw new Error(`EMBEDGYM_SERIAL_MS ${n} exceeds the ${SERIAL_MS_CAP} ms cap`);
  }
  return n;
}

function actionsText(serial: number | null): string | null {
  const file = process.env.EMBEDGYM_ACTIONS;
  if (!file) return null;
  if (serial === null) throw new Error('EMBEDGYM_ACTIONS needs EMBEDGYM_SERIAL_MS');
  return fs.readFileSync(file, 'utf8');
}

export default defineConfig(() => {
  const taskDir = process.env.EMBEDGYM_TASK;
  if (!taskDir) throw new Error('EMBEDGYM_TASK env var is not set — run via run.sh');
  if (!fs.existsSync(taskDir)) throw new Error(`EMBEDGYM_TASK path does not exist: ${taskDir}`);

  const target = process.env.EMBEDGYM_TARGET;
  if (!target) throw new Error('EMBEDGYM_TARGET env var is not set — run via run.sh');
  if (!(target in targets)) {
    throw new Error(`unknown target '${target}' (known: ${Object.keys(targets).join(', ')})`);
  }

  // A target whose behaviour genuinely diverges has its own complete test.jsonl.
  const standaloneJsonl = path.join(taskDir, target, 'test.jsonl');
  const jsonlPath = fs.existsSync(standaloneJsonl) ? standaloneJsonl : path.join(taskDir, 'test.jsonl');
  if (!fs.existsSync(jsonlPath)) throw new Error(`missing test.jsonl: ${jsonlPath}`);

  // Every known target this task has a directory for. The runner checks each
  // circuit row's target against this, so a typo'd or unported target name
  // raises at load time instead of silently binding no roles.
  const portedTargets = Object.keys(targets)
    .filter((t) => fs.existsSync(path.join(taskDir, t)));

  const targetDir = path.join(taskDir, target);
  const circuitPath = path.join(targetDir, 'circuit.ts');
  const artifact = targets[target as keyof typeof targets].artifact;
  const hexPath = process.env.EMBEDGYM_FIRMWARE ?? path.join(targetDir, artifact);

  if (!fs.existsSync(circuitPath)) throw new Error(`missing circuit.ts: ${circuitPath}`);
  if (!fs.existsSync(hexPath)) throw new Error(`missing compiled firmware: ${hexPath}`);

  let peerTaskDir: string | null = null;
  let peerToken: string | null = null;
  const proxy: Record<string, ProxyOptions> = {};
  if (fs.existsSync(path.join(targetDir, 'peer.py'))) {
    peerTaskDir = path.relative(path.resolve(__dirname, '..'), path.resolve(taskDir));
    if (!/^(tasks|selftests)\//.test(peerTaskDir)) {
      throw new Error(`a task with a peer.py must sit under tasks/ or selftests/: ${taskDir}`);
    }
    const cloudToken = process.env.EMBEDGYM_CLOUD_TOKEN;
    if (!cloudToken) throw new Error('EMBEDGYM_CLOUD_TOKEN env var is not set — run via run.sh');
    if (target === 'nrf52840_zephyr' || target === 'nrf52840_arduino') {
      peerToken = cloudToken;
    } else if (target === 'esp32s3_espidf' || target === 'esp32s3_arduino') {
      const cloudBase = process.env.EMBEDGYM_CLOUD_BASE;
      if (!cloudBase) throw new Error('EMBEDGYM_CLOUD_BASE env var is not set — run via run.sh');
      proxy['/embedgym-cloud'] = {
        target: cloudBase,
        rewrite: (url) => url.replace(/^\/embedgym-cloud/, ''),
        // Set per request, not as `headers`: vite's debug log prints the config.
        configure: (proxyServer) => {
          proxyServer.on('proxyReq', (proxyReq) => proxyReq.setHeader('X-EmbedGym-Token', cloudToken));
        },
      };
    } else {
      throw new Error(`target '${target}' runs no peer.py (peers run on esp32s3_espidf, esp32s3_arduino, nrf52840_zephyr and nrf52840_arduino)`);
    }
  }

  const rawFile = (name: string, filePath: string): Plugin => ({
    name: `embedgym-raw-${name}`,
    resolveId(id) { return id === `virtual:embedgym-${name}` ? id : null; },
    load(id) {
      if (id !== `virtual:embedgym-${name}`) return null;
      // Binary firmware (ESP merged flash image, Zephyr ELF) is served base64
      // — the backend drivers hand it to the bridge as-is; Intel hex stays
      // verbatim text.
      const ext = path.extname(filePath);
      let text: string;
      if (ext === '.bin' || ext === '.elf') text = fs.readFileSync(filePath).toString('base64');
      else if (ext === '.hex' || ext === '.jsonl') text = fs.readFileSync(filePath, 'utf8');
      else throw new Error(`unknown firmware artifact type '${ext}': ${filePath}`);
      return `export default ${JSON.stringify(text)};`;
    },
  });

  // Modules rather than `define`s, and from closures: vite's debug log prints
  // the resolved config, which must not carry the peer token.
  const valueModule = (name: string, value: string | null): Plugin => ({
    name: `embedgym-${name}`,
    resolveId(id) { return id === `virtual:embedgym-${name}` ? id : null; },
    load(id) { return id === `virtual:embedgym-${name}` ? `export default ${JSON.stringify(value)};` : null; },
  });

  const serial = serialMs();

  return {
    root: __dirname,
    define: {
      __EMBEDGYM_SERIAL_MS__: JSON.stringify(serial),
      __EMBEDGYM_TARGET__: JSON.stringify(target),
      __EMBEDGYM_PORTED_TARGETS__: JSON.stringify(portedTargets),
      __EMBEDGYM_PEER_TASK_DIR__: JSON.stringify(peerTaskDir),
    },
    // The harness root is a subdirectory, so vite's default fs.allow
    // stops there and 403s the /@fs/ request for the ngspice worker, which
    // the browser fetches as a plain URL from frontend/src.
    server: {
      port: 5176,
      fs: {
        allow: [
          __dirname,
          path.resolve(__dirname, '../velxio/frontend'),
        ],
      },
      proxy,
    },
    plugins: [
      react(), embedGymParts(), rawFile('jsonl', jsonlPath), rawFile('hex', hexPath),
      valueModule('peer-token', peerToken), valueModule('actions', actionsText(serial)),
    ],
    publicDir: path.resolve(__dirname, '../velxio/frontend/public'),
    resolve: {
      alias: {
        '@pro': path.resolve(__dirname, '../velxio/frontend/src/__pro_stub__'),
        '@velxio': path.resolve(__dirname, '../velxio/frontend/src'),
        '@circuit': circuitPath,
      },
    },
    // Pyodide finds its wasm and stdlib next to its own module, so it is served
    // from node_modules unbundled.
    optimizeDeps: { include: ['avr8js', 'rp2040js', '@wokwi/elements'], exclude: ['pyodide'] },
  };
});
