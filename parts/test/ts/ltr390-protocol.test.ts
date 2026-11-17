/**
 * ltr390-protocol.test.ts — the ltr390 part glue, and the real Adafruit_LTR390
 * library against the registered part on the AVR.
 *
 * Part 1 pins the attach paths: which simulator shape registers the worker
 * slave, which stays inert, and what the glue validates and forwards.
 *
 * Part 2 compiles sketches with arduino-cli for the Mega and runs them on the
 * avr8js CPU, where the part's Python model (embedgym_parts/i2c/ltr390.py) runs in
 * Pyodide with INT wired to pin 2, so every register sequence — begin()'s ID
 * check + reset + enable, enable/enabled, each setGain/setResolution/setMode
 * with its getter, newDataAvailable, readALS/readUVS, setThresholds +
 * configInterrupt for both sources and a persistence count — is the library's
 * own. Needs arduino-cli, `arduino:avr` and the Adafruit LTR390 Library
 * installed; skips otherwise.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../../sim/Ltr390';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { loadPythonModels } from '@velxio/simulation/python/PythonModels';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

/** Conversion period the part must show for a MEAS_RATE byte: max(integration, rate). */
const INTEGRATION_MS = [400, 200, 100, 50, 25, 12.5];

describe('ltr390 part — attachEvents', () => {
  const logic = PartSimulationRegistry.get('ltr390');

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  function attach(element: object, sim: object, intPin: number | null, id: string) {
    if (logic?.attachEvents === undefined) throw new Error('ltr390 part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(element as HTMLElement, sim as any, (p) => (p === 'INT' ? intPin : null), id);
  }

  it('a simulator without registerSensor stays inert', () => {
    let detach: (() => void) | undefined;
    expect(() => {
      detach = attach({}, { getCurrentCycles: () => 0, setPinState: () => {} }, null, 'LTR-bare');
    }).not.toThrow();
    expect(() => detach!()).not.toThrow();
  });

  it('registers the worker slave at virtual pin 200 + address with the counts and INT', () => {
    const sim = fakeBridgeSim();
    const detach = attach({ als: 45000, uvs: 1200 }, sim, INT_PIN, 'LTR-esp');
    expect(sim.registerSensor).toHaveBeenCalledWith('ltr390', 200 + 0x53, {
      addr: 0x53,
      als: 45000,
      uvs: 1200,
      int_pin: INT_PIN,
    });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x53);

    const unwired = fakeBridgeSim();
    attach({ als: 1, uvs: 2 }, unwired, null, 'LTR-esp-noint');
    expect(unwired.registerSensor).toHaveBeenCalledWith('ltr390', 200 + 0x53, {
      addr: 0x53,
      als: 1,
      uvs: 2,
    });
  });

  it('an element without als/uvs raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({}, sim, null, 'LTR-esp-bad')).toThrow(/als\/uvs state/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('a set reaches the worker slave and the element; an invalid value reaches neither', () => {
    const sim = fakeBridgeSim();
    const el = { als: 45000, uvs: 1200 };
    attach(el, sim, null, 'LTR-esp-set');
    dispatchSensorUpdate('LTR-esp-set', { als: 100 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x53, { als: 100 });
    expect(el.als).toBe(100);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('LTR-esp-set', { als: -1 })).toThrow(/als must be/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeBridgeSim(false);
    attach({ als: 45000, uvs: 1200 }, sim, null, 'LTR-declined');
    expect(hasSensorUpdateHandler('LTR-declined')).toBe(false);
  });
});

// ─── Part 2: real Adafruit_LTR390 firmware on the avr8js CPU ─────────────────

const FQBN = 'arduino:avr:mega';

function compileSketch(name: string, source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) | 0;
  const cache = join(tmpdir(), `velxio-ltr390-${name}-${hash >>> 0}.hex`);
  if (existsSync(cache)) return readFileSync(cache, 'utf-8');

  const work = mkdtempSync(join(tmpdir(), `velxio-ltr390-${name}-`));
  const sketchDir = join(work, name);
  const buildDir = join(work, 'build');
  mkdirSync(sketchDir);
  mkdirSync(buildDir);
  writeFileSync(join(sketchDir, `${name}.ino`), source);
  const r = spawnSync(
    'arduino-cli',
    ['compile', '--fqbn', FQBN, '--output-dir', buildDir, '--build-path', join(work, 'scratch'), sketchDir],
    { encoding: 'utf-8', timeout: 300_000 },
  );
  if (r.error) throw new Error(`arduino-cli not available: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`arduino-cli compile failed (exit ${r.status}):\n${r.stderr}\n${r.stdout}`);
  const hex = readFileSync(join(buildDir, `${name}.ino.hex`), 'utf-8');
  writeFileSync(cache, hex);
  return hex;
}

const TOOLCHAIN_AVAILABLE = (() => {
  if (spawnSync('arduino-cli', ['version'], { encoding: 'utf-8' }).status !== 0) return false;
  try {
    compileSketch('ltr390_probe', '#include <Wire.h>\n#include "Adafruit_LTR390.h"\nvoid setup(){}\nvoid loop(){}\n');
    return true;
  } catch {
    return false;
  }
})();

const CLOCK_HZ = 16_000_000;
const INT_PIN = 2;

/** Boot a Mega with the sketch and the registered ltr390 part on its I2C bus, INT on pin 2. */
function boot(hex: string, als = 45000, uvs = 1200) {
  const sim = new AVRSimulator(new PinManager(), 'mega');
  sim.loadHex(hex);
  const logic = PartSimulationRegistry.get('ltr390');
  if (logic?.attachEvents === undefined) throw new Error('ltr390 part not registered');
  const el = { als, uvs };
  const getPin = (name: string) => (name === 'INT' ? INT_PIN : null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detach = logic.attachEvents(el as unknown as HTMLElement, sim as any, getPin, 'LTR-test');

  const lines: string[] = [];
  let current = '';
  sim.onSerialData = (ch) => {
    if (ch === '\n') {
      lines.push(current.replace(/\r$/, ''));
      current = '';
    } else {
      current += ch;
    }
  };

  const nowMs = () => (sim.getCurrentCycles() / CLOCK_HZ) * 1000;
  /** Step the CPU until `done()` holds or `budgetMs` of simulated time elapse. */
  const runUntil = (done: () => boolean, budgetMs: number): boolean => {
    const end = nowMs() + budgetMs;
    while (nowMs() < end) {
      for (let i = 0; i < 2048; i++) sim.step();
      if (done()) return true;
    }
    return false;
  };
  const set = (values: { als?: number; uvs?: number }) => dispatchSensorUpdate('LTR-test', values);
  return { sim, lines, nowMs, runUntil, set, detach };
}

/** begin(), enable/enabled, every gain and resolution through the library's own setters and getters. */
const CONFIG = `
#include <Wire.h>
#include "Adafruit_LTR390.h"
Adafruit_LTR390 ltr;
void setup() {
  Serial.begin(115200);
  if (!ltr.begin()) { Serial.println("begin fail"); while (1) {} }
  Serial.print("en "); Serial.println(ltr.enabled());
  ltr.enable(false);
  Serial.print("en "); Serial.println(ltr.enabled());
  ltr.enable(true);
  Serial.print("en "); Serial.println(ltr.enabled());
  Serial.print("dflt "); Serial.print(ltr.getGain()); Serial.print(' ');
  Serial.print(ltr.getResolution()); Serial.print(' '); Serial.println(ltr.getMode());
  for (uint8_t g = 0; g <= 4; g++) {
    ltr.setGain((ltr390_gain_t)g);
    Serial.print("gain "); Serial.print(g); Serial.print(' '); Serial.println(ltr.getGain());
  }
  Serial.print("res-after-gain "); Serial.println(ltr.getResolution());
  for (uint8_t r = 0; r <= 5; r++) {
    ltr.setResolution((ltr390_resolution_t)r);
    Serial.print("res "); Serial.print(r); Serial.print(' '); Serial.println(ltr.getResolution());
  }
  Serial.print("gain-after-res "); Serial.println(ltr.getGain());
  Serial.println("done");
}
void loop() {}
`;

/** Each resolution in both modes: wait for data ready, time it, read the count. */
const MATRIX = `
#include <Wire.h>
#include "Adafruit_LTR390.h"
Adafruit_LTR390 ltr;
uint8_t r = 0;
void setup() {
  Serial.begin(115200);
  if (!ltr.begin()) { Serial.println("begin fail"); while (1) {} }
  ltr.setGain(LTR390_GAIN_18);
}
void loop() {
  if (r > 5) return;
  ltr.setResolution((ltr390_resolution_t)r);
  ltr.setMode(LTR390_MODE_ALS);
  uint32_t t0 = millis();
  while (!ltr.newDataAvailable()) {}
  uint32_t dtA = millis() - t0;
  uint32_t a = ltr.readALS();
  ltr.setMode(LTR390_MODE_UVS);
  t0 = millis();
  while (!ltr.newDataAvailable()) {}
  uint32_t dtU = millis() - t0;
  uint32_t u = ltr.readUVS();
  Serial.print("R "); Serial.print(r); Serial.print(' '); Serial.print(ltr.getMode()); Serial.print(' ');
  Serial.print(dtA); Serial.print(' '); Serial.print(a); Serial.print(' ');
  Serial.print(dtU); Serial.print(' '); Serial.println(u);
  r++;
  if (r > 5) Serial.println("done");
}
`;

/** Threshold interrupt on INT (pin 2, falling edge), source and persistence templated in. */
const INTERRUPT = `
#include <Wire.h>
#include "Adafruit_LTR390.h"
Adafruit_LTR390 ltr;
volatile uint16_t events = 0;
bool cleared = false;
void onInt() { events++; }
void setup() {
  Serial.begin(115200);
  pinMode(2, INPUT);
  if (!ltr.begin()) { Serial.println("begin fail"); while (1) {} }
  ltr.setMode(@MODE@);
  ltr.setThresholds(1000, 50000);
  ltr.configInterrupt(true, @MODE@, @PERSIST@);
  attachInterrupt(digitalPinToInterrupt(2), onInt, FALLING);
  Serial.println("armed");
}
void loop() {
  if (events >= 1 && !cleared) {
    cleared = true;
    Serial.print("clr "); Serial.print(millis()); Serial.print(' '); Serial.print(ltr.newDataAvailable());
    Serial.print(' '); Serial.println(digitalRead(2));
  }
  Serial.print("S "); Serial.print(millis()); Serial.print(' '); Serial.print(events);
  Serial.print(' '); Serial.println(digitalRead(2));
  delay(20);
}
`;

const interruptSketch = (mode: 'ALS' | 'UVS', persist: number) =>
  INTERRUPT.replace(/@MODE@/g, `LTR390_MODE_${mode}`).replace(/@PERSIST@/g, String(persist));

const fields = (line: string) => line.split(' ');
const num = (s: string) => Number(s);

describe.runIf(TOOLCHAIN_AVAILABLE)('ltr390 part driven by Adafruit_LTR390 firmware', () => {
  let config: string;
  let matrix: string;
  let intAls: string;
  let intUvs: string;
  beforeAll(async () => {
    await loadPythonModels();
    config = compileSketch('ltr390_config', CONFIG);
    matrix = compileSketch('ltr390_matrix', MATRIX);
    intAls = compileSketch('ltr390_int_als', interruptSketch('ALS', 2));
    intUvs = compileSketch('ltr390_int_uvs', interruptSketch('UVS', 0));
  }, 300_000);

  it('begin() completes; enable/enabled, every gain and every resolution round-trip through the library', () => {
    const { lines, runUntil, detach } = boot(config);
    expect(runUntil(() => lines.includes('done'), 1000)).toBe(true);
    expect(lines).not.toContain('begin fail');
    expect(lines.filter((l) => l.startsWith('en '))).toEqual(['en 1', 'en 0', 'en 1']);
    expect(lines).toContain('dflt 1 2 0'); // 3x, 18-bit, ALS
    for (let g = 0; g <= 4; g++) expect(lines).toContain(`gain ${g} ${g}`);
    for (let r = 0; r <= 5; r++) expect(lines).toContain(`res ${r} ${r}`);
    expect(lines).toContain('res-after-gain 2');
    expect(lines).toContain('gain-after-res 4');
    detach();
  });

  it('every resolution in both modes: data ready after the integration time, counts from the right register', () => {
    const { lines, runUntil, set, detach } = boot(matrix, 45000, 1200);
    expect(runUntil(() => lines.filter((l) => l.startsWith('R ')).length >= 2, 2000)).toBe(true);
    set({ als: 320, uvs: 24000 });
    expect(runUntil(() => lines.includes('done'), 3000)).toBe(true);
    const rows = lines.filter((l) => l.startsWith('R ')).map(fields);
    expect(rows.map((r) => r[1])).toEqual(['0', '1', '2', '3', '4', '5']);
    for (const row of rows) {
      const res = num(row[1]);
      expect(row[2]).toBe('1'); // getMode() reads back UVS after the switch
      const expected = Math.max(INTEGRATION_MS[res], 100); // default 100 ms rate
      for (const dt of [num(row[3]), num(row[5])]) {
        expect(dt, `res ${res}`).toBeGreaterThanOrEqual(expected - 2);
        expect(dt, `res ${res}`).toBeLessThanOrEqual(expected + 6);
      }
    }
    // Gain 18: × 6, then × integration time / 100 ms, saturating at the resolution.
    expect(rows[0][4]).toBe('1048575'); // 45000 × 24 saturates the 20-bit scale
    expect(rows[0][6]).toBe('28800');
    expect(rows.at(-1)?.[4]).toBe('240'); // 13-bit: 320 × 0.75
    expect(rows.at(-1)?.[6]).toBe('8191'); // 24000 × 0.75 saturates 13 bits
    detach();
  });

  it('ALS-source interrupt with persistence 2: INT falls on the third out-of-range conversion, releases on the status read', () => {
    const { lines, nowMs, runUntil, set, detach } = boot(intAls, 45000);
    expect(runUntil(() => lines.includes('armed'), 500)).toBe(true);
    expect(runUntil(() => lines.filter((l) => l.startsWith('S ')).length >= 10, 1000)).toBe(true);
    for (const row of lines.filter((l) => l.startsWith('S ')).map(fields)) expect(row.slice(2)).toEqual(['0', '1']);

    const tSet = nowMs();
    set({ als: 60000 });
    expect(runUntil(() => lines.some((l) => l.startsWith('clr ')), 1000)).toBe(true);
    const clr = fields(lines.find((l) => l.startsWith('clr ')) ?? '');
    // 18-bit / 100 ms: persistence 2 means the third out-of-range conversion
    // fires, 200–300 ms after the change depending on conversion phase, and
    // the sketch reports it within one 20 ms loop.
    expect(num(clr[1]) - tSet).toBeGreaterThan(198);
    expect(num(clr[1]) - tSet).toBeLessThan(340);
    expect(clr[3]).toBe('1'); // released by the MAIN_STATUS read newDataAvailable() performs

    // Still out of range: the next conversion re-asserts, then the pin stays low unread.
    expect(runUntil(() => lines.filter((l) => l.startsWith('S ')).some((l) => fields(l)[2] === '2'), 300)).toBe(true);
    set({ als: 45000 });
    const seen = lines.length;
    expect(runUntil(() => lines.length >= seen + 20, 1000)).toBe(true);
    for (const row of lines.slice(seen).map(fields)) expect(row.slice(2)).toEqual(['2', '0']);
    detach();
  });

  it('UVS-source interrupt with persistence 0: fires on the first out-of-range UVS conversion and clears', () => {
    const { lines, runUntil, set, detach } = boot(intUvs, 60000, 1200);
    expect(runUntil(() => lines.filter((l) => l.startsWith('S ')).length >= 10, 1000)).toBe(true);
    for (const row of lines.filter((l) => l.startsWith('S ')).map(fields)) expect(row.slice(2)).toEqual(['0', '1']);
    set({ uvs: 70000 });
    expect(runUntil(() => lines.some((l) => l.startsWith('clr ')), 300)).toBe(true);
    set({ uvs: 1200 });
    const seen = lines.length;
    expect(runUntil(() => lines.length >= seen + 20, 1000)).toBe(true);
    const last = fields(lines.at(-1) ?? '');
    expect(last[2]).toBe('1');
    expect(last[3]).toBe('1');
    detach();
  });
});

describe.skipIf(TOOLCHAIN_AVAILABLE)('ltr390 firmware tests skipped', () => {
  it('needs arduino-cli with arduino:avr and the Adafruit LTR390 Library installed', () => {
    expect(true).toBe(true);
  });
});
