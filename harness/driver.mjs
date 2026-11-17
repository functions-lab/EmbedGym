// Browser driver for run.sh. Opens the harness URL in Chromium via
// puppeteer-core (headless unless --headful), streams the page's console to
// stdout, waits for the runner to set window.__testResult, prints the verdict
// parsed from it, closes the browser, and exits 0/1.
//
// --persist (headful only): keep the browser open; each page reload re-runs
// the sim and prints a fresh verdict. Ctrl-C (or closing the browser) exits
// with the last verdict's code.
//
// Env: EMBEDGYM_CHROME (chrome executable override), EMBEDGYM_TIMEOUT_MS (wait for a
// result, default 120000; disabled under --persist).
//
// Under run.sh --serial-ms the runner publishes a serial dump instead of
// checks; the driver prints it as [serial] lines, an action script's lines as
// `> <action>`, and exits 0, or after a failed run prints the failure too and
// exits 1.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const headful = args.includes('--headful');
const persist = args.includes('--persist');
if (!url) {
  console.error('usage: node driver.mjs <url> [--headful] [--persist]');
  process.exit(1);
}

function findChrome() {
  const candidates = [];
  if (process.env.EMBEDGYM_CHROME) {
    candidates.push(process.env.EMBEDGYM_CHROME);
    if (existsSync(process.env.EMBEDGYM_CHROME)) return process.env.EMBEDGYM_CHROME;
  }
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  candidates.push(macChrome);
  if (existsSync(macChrome)) return macChrome;
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    candidates.push(name);
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      // not on PATH, try next candidate
    }
  }
  throw new Error(`no chrome executable found; tried: ${candidates.join(', ')}. Set EMBEDGYM_CHROME.`);
}

const timeoutMs = Number(process.env.EMBEDGYM_TIMEOUT_MS || 120000);
const POLL_MS = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: !headful,
  // Puppeteer's default SIGINT handler exits 130; ours below exits with the
  // last verdict's code instead (--persist spec: Ctrl-C keeps the verdict).
  handleSIGINT: false,
  handleSIGTERM: false,
  args: [
    // --no-sandbox: needed to run as root in docker; the page only ever loads
    // the local harness. Throttling flags keep the rAF-driven sim loop running.
    '--no-sandbox',
    // No user gesture in headless — without this every buzzer beep logs an
    // AudioContext autoplay warning.
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
  defaultViewport: headful ? null : { width: 1280, height: 800 },
});

let exitCode = 1;

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    browser.close().finally(() => process.exit(exitCode));
  });
}

function printVerdict(result) {
  // Serial mode (run.sh --serial-ms): a dump, not a verdict. The `[serial] `
  // prefix is emitted only here — page console lines get `[browser] ` and a
  // serial line cannot embed a newline — so the sim server extracts exactly
  // these lines and nothing the sketch printed can forge one.
  if (result.serial) {
    for (const line of result.serial) {
      // `|| 0`: ESP's `app start` line sits 1 ns before t=0 and would print as -0.
      const ms = Math.round(line.t) || 0;
      const text = line.action ? `> ${line.text}` : `${line.text}${line.partial ? ' (no newline)' : ''}`;
      console.log(`[serial] [${ms} ms] ${text}`);
    }
    console.log(`serial run — ${result.serial.length} lines`);
    if (result.fail === 0) return 0;
  }
  const pass = result.pass ?? 0;
  const fail = result.fail ?? 0;
  console.log(`${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
  for (const c of result.checks ?? []) {
    if (!c.ok) console.log(`  [FAIL] ${c.detail ?? ''}`);
  }
  return fail === 0 ? 0 : 1;
}

// An exception nothing in the page caught (a part raising in a callback the
// runner does not await) fails the run, serial mode included.
function withPageError(result, message) {
  return {
    pass: result.pass ?? 0,
    fail: (result.fail ?? 0) + 1,
    checks: [...(result.checks ?? []), { ok: false, detail: `harness error: uncaught page error: ${message}` }],
  };
}

// Sample window.__testResult, tolerating the evaluate() rejections that page
// reloads cause. Returns the result object, undefined (not set yet), or
// 'closed' when the tab/browser is gone.
async function sampleResult(page) {
  try {
    return await page.evaluate(() => window.__testResult);
  } catch {
    if (!browser.connected || page.isClosed()) return 'closed';
    return undefined;
  }
}

try {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log(`[browser] ${msg.text()}`));
  // The first uncaught error since the page (re)loaded.
  let pageError = null;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) pageError = null;
  });
  page.on('pageerror', (err) => {
    console.log(`[browser:error] ${err.stack || err.message}`);
    pageError ??= err.message ?? String(err);
  });
  page.on('requestfailed', (req) =>
    console.log(`[browser:netfail] ${req.url()} ${req.failure()?.errorText ?? ''}`)
  );
  // A crashed renderer never sets __testResult; without this the run would
  // wait out EMBEDGYM_TIMEOUT_MS.
  let pageCrash = null;
  page.on('error', (err) => {
    pageCrash = err.message ?? String(err);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  runs: for (;;) {
    const deadline = persist ? Infinity : Date.now() + timeoutMs;
    let result;
    while ((result = await sampleResult(page)) === undefined) {
      if (pageCrash !== null) {
        exitCode = printVerdict({ fail: 1, checks: [{ ok: false, detail: `harness error: page crashed: ${pageCrash}` }] });
        break runs;
      }
      if (Date.now() > deadline) {
        console.log(`FAIL — no result from browser after ${timeoutMs}ms (EMBEDGYM_TIMEOUT_MS)`);
        break runs;
      }
      await sleep(POLL_MS);
    }
    if (result === 'closed') break;
    exitCode = printVerdict(pageError === null ? result : withPageError(result, pageError));
    if (!persist) break;
    // Wait for a reload (window.__testResult resets), then grade the next run.
    for (;;) {
      const r = await sampleResult(page);
      if (r === 'closed') break runs;
      if (r === undefined) break;
      await sleep(POLL_MS);
    }
  }
} finally {
  await browser.close().catch(() => {});
}
process.exit(exitCode);
