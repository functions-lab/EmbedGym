/**
 * vl53l0x-protocol.test.ts — the vl53l0x part glue, and the real
 * Adafruit_VL53L0X and Pololu VL53L0X drivers against the registered part on
 * the AVR.
 *
 * Part 1 pins the attach paths: which simulator shape registers the worker
 * slave, which stays inert, and what the glue validates and forwards.
 *
 * Part 2 compiles sketches with arduino-cli for the Mega and runs them on the
 * avr8js CPU, where the part's Python model (embedgym_parts/i2c/vl53l0x.py) runs in
 * Pyodide, so every register sequence the drivers issue — DataInit,
 * StaticInit's tuning blob, reference SPAD management, VHV/phase calibration,
 * timing-budget and VCSEL-period read/write, single-shot and both continuous
 * modes, each `configSensor` preset, and the address change — is the
 * library's own. Needs arduino-cli, `arduino:avr`, Adafruit_VL53L0X and
 * Pololu VL53L0X installed; skips otherwise.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../../sim/Vl53l0x';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { loadPythonModels } from '@velxio/simulation/python/PythonModels';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

describe('vl53l0x part — attachEvents', () => {
  const logic = PartSimulationRegistry.get('vl53l0x');

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  function attach(element: object, sim: object, id: string) {
    if (logic?.attachEvents === undefined) throw new Error('vl53l0x part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(element as HTMLElement, sim as any, () => null, id);
  }

  it('a simulator without registerSensor stays inert', () => {
    let detach: (() => void) | undefined;
    expect(() => {
      detach = attach({}, { getCurrentCycles: () => 0 }, 'TOF-bare');
    }).not.toThrow();
    expect(() => detach!()).not.toThrow();
  });

  it('registers the worker slave at virtual pin 200 + address with the distance', () => {
    const sim = fakeBridgeSim();
    const detach = attach({ distance: 350 }, sim, 'TOF-esp');
    expect(sim.registerSensor).toHaveBeenCalledWith('vl53l0x', 200 + 0x29, { addr: 0x29, distance: 350 });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x29);
  });

  it('an element without distance raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({}, sim, 'TOF-esp-bad')).toThrow(/distance state/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('a set reaches the worker slave and the element; an invalid value reaches neither', () => {
    const sim = fakeBridgeSim();
    const el = { distance: 100 };
    attach(el, sim, 'TOF-esp-set');
    dispatchSensorUpdate('TOF-esp-set', { distance: 1200 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x29, { distance: 1200 });
    expect(el.distance).toBe(1200);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('TOF-esp-set', { distance: -1 })).toThrow(/finite non-negative/);
    expect(() => dispatchSensorUpdate('TOF-esp-set', { range: 5 })).toThrow(/unknown property/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeBridgeSim(false);
    attach({ distance: 100 }, sim, 'TOF-declined');
    expect(hasSensorUpdateHandler('TOF-declined')).toBe(false);
  });
});

// ─── Part 2: real driver firmware on the avr8js CPU ──────────────────────────

const FQBN = 'arduino:avr:mega';

function compileSketch(name: string, source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) | 0;
  const cache = join(tmpdir(), `velxio-vl53l0x-${name}-${hash >>> 0}.hex`);
  if (existsSync(cache)) return readFileSync(cache, 'utf-8');

  const work = mkdtempSync(join(tmpdir(), `velxio-vl53l0x-${name}-`));
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
    compileSketch(
      'vl53l0x_probe',
      '#include <Wire.h>\n#include "Adafruit_VL53L0X.h"\n#include <VL53L0X.h>\nvoid setup(){}\nvoid loop(){}\n',
    );
    return true;
  } catch {
    return false;
  }
})();

const CLOCK_HZ = 16_000_000;

/** Boot a Mega with the sketch and the registered vl53l0x part on its I2C bus. */
function boot(hex: string, distance = 100) {
  const sim = new AVRSimulator(new PinManager(), 'mega');
  sim.loadHex(hex);
  const logic = PartSimulationRegistry.get('vl53l0x');
  if (logic?.attachEvents === undefined) throw new Error('vl53l0x part not registered');
  const el = { distance };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detach = logic.attachEvents(el as unknown as HTMLElement, sim as any, () => null, 'TOF-test');

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
  const setDistance = (mm: number) => dispatchSensorUpdate('TOF-test', { distance: mm });
  return { sim, lines, nowMs, runUntil, setDistance, detach };
}

const ADAFRUIT_SINGLE = `
#include <Wire.h>
#include "Adafruit_VL53L0X.h"
Adafruit_VL53L0X lox;
void setup() {
  Serial.begin(115200);
  if (!lox.begin()) { Serial.println("begin fail"); while (1) {} }
  Serial.print("budget "); Serial.println(lox.getMeasurementTimingBudgetMicroSeconds());
  Serial.print("vcsel "); Serial.print(lox.getVcselPulsePeriod(VL53L0X_VCSEL_PERIOD_PRE_RANGE));
  Serial.print(' '); Serial.println(lox.getVcselPulsePeriod(VL53L0X_VCSEL_PERIOD_FINAL_RANGE));
  if (!lox.setMeasurementTimingBudgetMicroSeconds(200000)) Serial.println("budget fail");
  Serial.print("budget "); Serial.println(lox.getMeasurementTimingBudgetMicroSeconds());
}
void loop() {
  VL53L0X_RangingMeasurementData_t m;
  lox.rangingTest(&m, false);
  Serial.print("T "); Serial.print(m.RangeStatus); Serial.print(' '); Serial.println(m.RangeMilliMeter);
  uint16_t r = lox.readRange();
  Serial.print("R "); Serial.print(lox.readRangeStatus()); Serial.print(' '); Serial.println(r);
  lox.startRange();
  while (!lox.isRangeComplete()) {}
  Serial.print("S "); Serial.println(lox.readRangeResult());
  delay(20);
}
`;

const ADAFRUIT_PRESETS = `
#include <Wire.h>
#include "Adafruit_VL53L0X.h"
Adafruit_VL53L0X lox;
const Adafruit_VL53L0X::VL53L0X_Sense_config_t CFGS[] = {
  Adafruit_VL53L0X::VL53L0X_SENSE_DEFAULT, Adafruit_VL53L0X::VL53L0X_SENSE_LONG_RANGE,
  Adafruit_VL53L0X::VL53L0X_SENSE_HIGH_SPEED, Adafruit_VL53L0X::VL53L0X_SENSE_HIGH_ACCURACY };
void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 4; i++) {
    bool ok = lox.begin(VL53L0X_I2C_ADDR, false, &Wire, CFGS[i]);
    VL53L0X_RangingMeasurementData_t m;
    lox.rangingTest(&m, false);
    Serial.print("P"); Serial.print(i); Serial.print(ok ? " ok " : " fail ");
    Serial.print(lox.getMeasurementTimingBudgetMicroSeconds()); Serial.print(' ');
    Serial.print(lox.getVcselPulsePeriod(VL53L0X_VCSEL_PERIOD_PRE_RANGE)); Serial.print(' ');
    Serial.print(lox.getVcselPulsePeriod(VL53L0X_VCSEL_PERIOD_FINAL_RANGE)); Serial.print(' ');
    Serial.print(lox.getLimitCheckValue(VL53L0X_CHECKENABLE_SIGNAL_RATE_FINAL_RANGE)); Serial.print(' ');
    Serial.print(lox.getLimitCheckEnable(VL53L0X_CHECKENABLE_RANGE_IGNORE_THRESHOLD)); Serial.print(' ');
    Serial.print(m.RangeStatus); Serial.print(' '); Serial.println(m.RangeMilliMeter);
  }
  Serial.println("done");
}
void loop() {}
`;

const ADAFRUIT_CONTINUOUS = `
#include <Wire.h>
#include "Adafruit_VL53L0X.h"
Adafruit_VL53L0X lox;
uint8_t n = 0;
void setup() {
  Serial.begin(115200);
  if (!lox.begin()) { Serial.println("begin fail"); while (1) {} }
  Serial.print("start "); Serial.println(millis());
  if (!lox.startRangeContinuous(100)) Serial.println("start fail");
}
void loop() {
  if (n < 6) {
    if (lox.isRangeComplete()) {
      Serial.print("C "); Serial.print(millis()); Serial.print(' '); Serial.println(lox.readRangeResult());
      n++;
    }
  } else if (n == 6) {
    lox.stopRangeContinuous();
    Serial.print("stopped "); Serial.println(lox.isRangeComplete());
    lox.setDeviceMode(VL53L0X_DEVICEMODE_CONTINUOUS_RANGING);
    lox.startMeasurement();
    n++;
  } else if (n < 13) {
    if (lox.waitRangeComplete()) {
      Serial.print("B "); Serial.print(millis()); Serial.print(' '); Serial.println(lox.readRangeResult());
    }
    n++;
  } else if (n == 13) {
    lox.stopMeasurement();
    Serial.println("done");
    n++;
  }
}
`;

const ADAFRUIT_ADDRESS = `
#include <Wire.h>
#include "Adafruit_VL53L0X.h"
Adafruit_VL53L0X lox;
void setup() {
  Serial.begin(115200);
  if (!lox.begin(0x30)) { Serial.println("begin fail"); while (1) {} }
  Serial.println("begin ok");
}
void loop() {
  VL53L0X_RangingMeasurementData_t m;
  lox.rangingTest(&m, false);
  Serial.print("T "); Serial.println(m.RangeMilliMeter);
  delay(20);
}
`;

const POLOLU = `
#include <Wire.h>
#include <VL53L0X.h>
VL53L0X sensor;
uint8_t n = 0;
void setup() {
  Serial.begin(115200);
  Wire.begin();
  sensor.setTimeout(500);
  if (!sensor.init()) { Serial.println("init fail"); while (1) {} }
  sensor.setAddress(0x31);
  Serial.print("budget "); Serial.println(sensor.getMeasurementTimingBudget());
  sensor.setSignalRateLimit(0.1);
  sensor.setVcselPulsePeriod(VL53L0X::VcselPeriodPreRange, 18);
  sensor.setVcselPulsePeriod(VL53L0X::VcselPeriodFinalRange, 14);
  sensor.setMeasurementTimingBudget(200000);
  Serial.print("budget "); Serial.println(sensor.getMeasurementTimingBudget());
  Serial.print("vcsel "); Serial.print(sensor.getVcselPulsePeriod(VL53L0X::VcselPeriodPreRange));
  Serial.print(' '); Serial.println(sensor.getVcselPulsePeriod(VL53L0X::VcselPeriodFinalRange));
  Serial.print("S "); Serial.println(sensor.readRangeSingleMillimeters());
  Serial.print("start "); Serial.println(millis());
  sensor.startContinuous(100);
}
void loop() {
  if (n < 5) {
    uint16_t mm = sensor.readRangeContinuousMillimeters();
    Serial.print("C "); Serial.print(millis()); Serial.print(' '); Serial.println(mm);
    n++;
  } else if (n == 5) {
    sensor.stopContinuous();
    Serial.print("S "); Serial.println(sensor.readRangeSingleMillimeters());
    Serial.println(sensor.timeoutOccurred() ? "timeout" : "done");
    n++;
  }
}
`;

const fields = (line: string) => line.split(' ');
const num = (s: string) => Number(s);

describe.runIf(TOOLCHAIN_AVAILABLE)('vl53l0x part driven by Adafruit_VL53L0X firmware', () => {
  let single: string;
  let presets: string;
  let continuous: string;
  let address: string;
  beforeAll(async () => {
    await loadPythonModels();
    single = compileSketch('vl53l0x_single', ADAFRUIT_SINGLE);
    presets = compileSketch('vl53l0x_presets', ADAFRUIT_PRESETS);
    continuous = compileSketch('vl53l0x_continuous', ADAFRUIT_CONTINUOUS);
    address = compileSketch('vl53l0x_address', ADAFRUIT_ADDRESS);
  }, 300_000);

  it('begin() completes, budgets and VCSEL periods round-trip, single-shot APIs track the driven distance', () => {
    const { lines, runUntil, setDistance, detach } = boot(single, 100);
    expect(runUntil(() => lines.some((l) => l.startsWith('S ')), 2000)).toBe(true);
    expect(lines).not.toContain('begin fail');
    expect(lines).not.toContain('budget fail');

    const budgets = lines.filter((l) => l.startsWith('budget ')).map((l) => num(fields(l)[1]));
    expect(budgets[0]).toBeGreaterThan(20_000); // ST default ≈ 33 ms
    expect(budgets[0]).toBeLessThan(40_000);
    expect(Math.abs(budgets[1] - 200_000)).toBeLessThan(2_000);
    expect(fields(lines.find((l) => l.startsWith('vcsel ')) ?? '')).toEqual(['vcsel', '14', '10']);

    const cycle = (prefix: string) => fields(lines.filter((l) => l.startsWith(prefix)).at(-1) ?? '');
    expect(cycle('T ')).toEqual(['T', '0', '100']);
    expect(cycle('R ')).toEqual(['R', '0', '100']);
    expect(cycle('S ')).toEqual(['S', '100']);

    setDistance(1234);
    let seen = lines.length;
    expect(runUntil(() => lines.length >= seen + 6, 500)).toBe(true);
    expect(cycle('T ')).toEqual(['T', '0', '1234']);
    expect(cycle('R ')).toEqual(['R', '0', '1234']);
    expect(cycle('S ')).toEqual(['S', '1234']);

    setDistance(2400);
    seen = lines.length;
    expect(runUntil(() => lines.length >= seen + 6, 500)).toBe(true);
    expect(cycle('T ')).toEqual(['T', '4', '8190']); // status 4 = phase fail = out of range
    expect(cycle('R ')).toEqual(['R', '4', '8190']);
    expect(cycle('S ')).toEqual(['S', '65535']); // readRangeResult() masks status 4
    detach();
  });

  it('every configSensor preset initialises and applies its budget, VCSEL periods and limits', () => {
    const { lines, runUntil, detach } = boot(presets, 300);
    expect(runUntil(() => lines.includes('done'), 3000)).toBe(true);
    const rows = lines.filter((l) => /^P\d /.test(l)).map(fields);
    expect(rows.map((r) => r.slice(0, 2))).toEqual([['P0', 'ok'], ['P1', 'ok'], ['P2', 'ok'], ['P3', 'ok']]);
    const [dflt, longRange, highSpeed, highAccuracy] = rows;
    // budget, pre-range VCSEL, final-range VCSEL, signal-rate limit (16.16), RIT enable, status, mm
    expect(num(dflt[2])).toBeGreaterThan(20_000);
    expect(num(dflt[2])).toBeLessThan(40_000);
    expect(dflt.slice(3, 5)).toEqual(['14', '10']);
    expect(dflt[6]).toBe('1');
    expect(Math.abs(num(longRange[2]) - 33_000)).toBeLessThan(2_000);
    expect(longRange.slice(3, 5)).toEqual(['18', '14']);
    expect(Math.abs(num(longRange[5]) - 0.1 * 65536)).toBeLessThan(600); // 9.7-bit register granularity
    expect(Math.abs(num(highSpeed[2]) - 30_000)).toBeLessThan(2_000);
    expect(Math.abs(num(highSpeed[5]) - 0.25 * 65536)).toBeLessThan(600);
    expect(Math.abs(num(highAccuracy[2]) - 200_000)).toBeLessThan(2_000);
    expect(highAccuracy[6]).toBe('0');
    for (const row of rows) expect(row.slice(7)).toEqual(['0', '300']);
    detach();
  });

  it('timed continuous paces at the period, stop completes, back-to-back paces at the budget', () => {
    const { lines, runUntil, setDistance, detach } = boot(continuous, 100);
    expect(runUntil(() => lines.filter((l) => l.startsWith('C ')).length >= 3, 2000)).toBe(true);
    setDistance(555);
    expect(runUntil(() => lines.includes('done'), 2000)).toBe(true);
    expect(lines).not.toContain('start fail');

    const start = num(fields(lines.find((l) => l.startsWith('start ')) ?? '')[1]);
    const timed = lines.filter((l) => l.startsWith('C ')).map(fields);
    expect(timed).toHaveLength(6);
    expect(num(timed[0][1]) - start).toBeLessThan(60); // first result after one budget
    for (let i = 1; i < timed.length; i++) {
      const gap = num(timed[i][1]) - num(timed[i - 1][1]);
      expect(gap).toBeGreaterThanOrEqual(90);
      expect(gap).toBeLessThanOrEqual(115);
    }
    expect(timed[0][2]).toBe('100');
    expect(timed.at(-1)?.[2]).toBe('555');

    expect(lines).toContain('stopped 0'); // nothing pending after a completed stop
    const b2b = lines.filter((l) => l.startsWith('B ')).map(fields);
    expect(b2b).toHaveLength(6);
    for (let i = 1; i < b2b.length; i++) {
      const gap = num(b2b[i][1]) - num(b2b[i - 1][1]);
      expect(gap).toBeGreaterThanOrEqual(25);
      expect(gap).toBeLessThanOrEqual(40);
    }
    for (const row of b2b) expect(row[2]).toBe('555');
    detach();
  });

  it('begin(0x30) moves the device to the new address and ranging continues there', () => {
    const { sim, lines, runUntil, detach } = boot(address, 777);
    expect(runUntil(() => lines.filter((l) => l.startsWith('T ')).length >= 2, 2000)).toBe(true);
    expect(lines[0]).toBe('begin ok');
    expect(lines.filter((l) => l.startsWith('T ')).at(-1)).toBe('T 777');
    expect(sim.getI2CBus().listDevices().map((d) => d.address)).toEqual([0x30]);
    detach();
    expect(sim.getI2CBus().listDevices()).toEqual([]);
  });
});

describe.runIf(TOOLCHAIN_AVAILABLE)('vl53l0x part driven by Pololu VL53L0X firmware', () => {
  let hex: string;
  beforeAll(async () => {
    await loadPythonModels();
    hex = compileSketch('vl53l0x_pololu', POLOLU);
  }, 300_000);

  it('init, setAddress, budget / limit / VCSEL setters, single and continuous ranging', () => {
    const { sim, lines, runUntil, setDistance, detach } = boot(hex, 420);
    expect(runUntil(() => lines.filter((l) => l.startsWith('C ')).length >= 2, 2000)).toBe(true);
    setDistance(1500);
    expect(runUntil(() => lines.includes('done') || lines.includes('timeout'), 2000)).toBe(true);
    expect(lines).not.toContain('init fail');
    expect(lines.at(-1)).toBe('done');

    const budgets = lines.filter((l) => l.startsWith('budget ')).map((l) => num(fields(l)[1]));
    expect(budgets[0]).toBeGreaterThan(20_000);
    expect(budgets[0]).toBeLessThan(40_000);
    expect(Math.abs(budgets[1] - 200_000)).toBeLessThan(2_000);
    expect(lines.find((l) => l.startsWith('vcsel '))).toBe('vcsel 18 14');

    const singles = lines.filter((l) => l.startsWith('S '));
    expect(singles).toEqual(['S 420', 'S 1500']);

    const start = num(fields(lines.find((l) => l.startsWith('start ')) ?? '')[1]);
    const cont = lines.filter((l) => l.startsWith('C ')).map(fields);
    expect(cont).toHaveLength(5);
    expect(num(cont[0][1]) - start).toBeLessThan(60);
    for (let i = 1; i < cont.length; i++) {
      const gap = num(cont[i][1]) - num(cont[i - 1][1]);
      expect(gap).toBeGreaterThanOrEqual(90);
      expect(gap).toBeLessThanOrEqual(115);
    }
    expect(cont[0][2]).toBe('420');
    expect(cont.at(-1)?.[2]).toBe('1500');
    expect(sim.getI2CBus().listDevices().map((d) => d.address)).toEqual([0x31]);
    detach();
  });
});

describe.skipIf(TOOLCHAIN_AVAILABLE)('vl53l0x firmware tests skipped', () => {
  it('needs arduino-cli with arduino:avr, Adafruit_VL53L0X and VL53L0X (Pololu) installed', () => {
    expect(true).toBe(true);
  });
});
