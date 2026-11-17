// Browser smoke test: the behaviors that need a real sim and so cannot be unit
// tested. Run the demo, then:
//
//   node demo/test/smoke.mjs [baseUrl]
//
// Exits 0 if every case passes, 1 otherwise. Each case names what breaks if it
// fails, because most of them guard a seam with the frontend or the harness
// rather than the demo's own code.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const puppeteer = (
  await import(
    path.join(HERE, '../../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')
  )
).default;

const BASE = process.argv[2] ?? 'http://localhost:5178';
const CHROME =
  process.env.EMBEDGYM_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) throw new Error(`no chrome at ${CHROME} — set EMBEDGYM_CHROME`);

const GRADE_TIMEOUT_MS = 120_000;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});

async function open(routePath, settleMs = 5000) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message.slice(0, 200)));
  await page.goto(BASE + routePath, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, settleMs));
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clickToolbar = (page, re) =>
  page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const btn = [...document.querySelectorAll('.task-toolbar button')].find((b) =>
      rx.test(b.textContent.trim()),
    );
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, re.source);

async function gradeAndWait(page) {
  await clickToolbar(page, /run & grade/);
  const deadline = Date.now() + GRADE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(1500);
    const v = await page.evaluate(() => document.querySelector('.verdict')?.textContent ?? '');
    if (/PASS|FAIL|error/i.test(v)) return v;
  }
  return 'TIMEOUT';
}

const ledValue = (page, id) =>
  page.evaluate((cid) => {
    const wrapper = document.querySelector(`[data-component-id="${cid}"]`);
    const el = wrapper?.querySelector(`#${CSS.escape(cid)}`) ?? wrapper?.firstElementChild;
    return el ? !!el.value : null;
  }, id);

// ── catalog pages ─────────────────────────────────────────────────────────

{
  const page = await open('/tasks');
  const r = await page.evaluate(() => ({
    cards: document.querySelectorAll('.task-card').length,
    // A thumbnail that never upgraded collapses to zero width.
    drawn: [...document.querySelectorAll('.part-preview > div > *')].filter(
      (e) => e.getBoundingClientRect().width > 2,
    ).length,
    thumbs: document.querySelectorAll('.part-preview').length,
  }));
  check('/tasks lists tasks', r.cards > 40, `${r.cards} cards`);
  check('/tasks renders every part thumbnail', r.thumbs > 0 && r.drawn === r.thumbs,
    `${r.drawn}/${r.thumbs} drawn`);
  check('/tasks has no page errors', page.errors.length === 0, page.errors[0]);
  await page.close();
}

{
  const page = await open('/boards');
  const r = await page.evaluate(() => ({
    targets: document.querySelectorAll('.target-card').length,
    boardsDrawn: [...document.querySelectorAll('.board-art .part-preview > div > *')].filter(
      (e) => e.getBoundingClientRect().width > 2,
    ).length,
    comps: document.querySelectorAll('.comp-card').length,
    missing: document.querySelectorAll('.part-preview.missing').length,
  }));
  check('/boards renders every board', r.targets > 0 && r.boardsDrawn === r.targets,
    `${r.boardsDrawn}/${r.targets} drawn`);
  check('/boards lists components', r.comps > 20, `${r.comps} cards`);
  check('/boards renders every component', r.missing === 0, `${r.missing} without artwork`);
  await page.close();
}

// ── a task: circuit, grading, and the frontend seams ──────────────────────

{
  const page = await open('/tasks/blink_led_1hz', 6000);

  const circuit = await page.evaluate(() => ({
    parts: document.querySelectorAll('.circuit-part').length,
    wires: document.querySelectorAll('.circuit-wires line').length,
    error: document.querySelector('.compile-error')?.textContent ?? null,
  }));
  check('circuit loads', circuit.error === null, circuit.error);
  check('circuit preview draws its parts', circuit.parts === 3, `${circuit.parts} parts`);
  // Wires need pinInfo from the mounted elements; a GND rail alias is the
  // case that silently drops one.
  check('circuit preview draws every wire', circuit.wires === 3, `${circuit.wires}/3 wires`);

  check('editor shows the sketch', await page.evaluate(() => !!document.querySelector('.monaco-editor')));

  const before = await page.evaluate(
    () => window.monaco?.editor?.getModels?.()[0]?.getValue()?.length ?? -1,
  );
  const verdict = await gradeAndWait(page);
  check('grading passes the gold sketch', verdict === 'PASS — 6 passed, 0 failed', verdict);

  // runGrading calls loadProjectState, which replaces the editor's file groups.
  const after = await page.evaluate(
    () => window.monaco?.editor?.getModels?.()[0]?.getValue()?.length ?? -1,
  );
  check('grading keeps the sketch', before > 0 && before === after, `${before} → ${after}`);

  // The harness clears a private AVRSimulator field to free-run; if that field
  // is renamed upstream the sim silently stays parked here.
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(await ledValue(page, 'L1'));
    await sleep(250);
  }
  check('sim keeps running after grading', new Set(samples).size > 1, JSON.stringify(samples));

  check('Stop is offered while running', await page.evaluate(() =>
    [...document.querySelectorAll('.task-toolbar button')].some(
      (b) => /^stop$/i.test(b.textContent.trim()) && !b.disabled,
    ),
  ));
  await clickToolbar(page, /^stop$/);
  await sleep(1500);
  const stopped = [];
  for (let i = 0; i < 8; i++) {
    stopped.push(await ledValue(page, 'L1'));
    await sleep(250);
  }
  check('Stop halts the sim', new Set(stopped).size === 1, JSON.stringify(stopped));

  check('task page has no page errors', page.errors.length === 0, page.errors[0]);
  await page.close();
}

// ── serial: the sim's own USART handler must survive the harness tap ──────

{
  const page = await open('/tasks/bme280_read_i2c', 6000);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /serial/i.test(b.textContent));
    btn?.click();
  });
  await sleep(1000);
  check('serial drawer opens', await page.evaluate(() => document.querySelectorAll('.drawer').length === 1));

  const verdict = await gradeAndWait(page);
  check('grading passes a serial task', /^PASS/.test(verdict), verdict);

  const text = await page.evaluate(() => document.querySelector('.drawer')?.innerText ?? '');
  check('serial monitor shows the sketch output', /Humidity: \d/.test(text),
    JSON.stringify(text.slice(0, 80)));
  await page.close();
}

// ── canvas edits are what gets graded ─────────────────────────────────────

{
  const page = await open('/tasks/blink_led_1hz', 6000);
  const rect = () =>
    page.evaluate(() => {
      const r = document.querySelector('[data-component-id="L1"]')?.getBoundingClientRect();
      return r ? { x: Math.round(r.x), y: Math.round(r.y) } : null;
    });

  const start = await rect();
  await page.mouse.move(start.x + 10, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y + 50, { steps: 12 });
  await page.mouse.up();
  await sleep(1200);
  const moved = await rect();
  check('a component can be dragged', moved.x !== start.x, `${JSON.stringify(start)} → ${JSON.stringify(moved)}`);

  await gradeAndWait(page);
  const afterGrade = await rect();
  check('grading keeps canvas edits', JSON.stringify(moved) === JSON.stringify(afterGrade),
    `${JSON.stringify(moved)} → ${JSON.stringify(afterGrade)}`);
  await page.close();
}

// ── results ───────────────────────────────────────────────────────────────

{
  const page = await open('/results');
  const runs = await page.evaluate(() => document.querySelectorAll('.run-list button').length);
  if (runs === 0) {
    console.log('SKIP  results — no run workspaces on disk');
  } else {
    await page.evaluate(() => document.querySelector('.run-list button').click());
    await sleep(1200);
    const r = await page.evaluate(() => ({
      steps: document.querySelectorAll('.step').length,
      hasCommand: !!document.querySelector('.code-snip.cmd'),
    }));
    check('a run trace renders its steps', r.steps > 0 && r.hasCommand, `${r.steps} steps`);
  }
  check('/results has no page errors', page.errors.length === 0, page.errors[0]);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nall smoke checks passed' : `\n${failures} smoke check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
