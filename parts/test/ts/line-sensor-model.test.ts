import { describe, expect, it } from 'vitest';
import { lineSensorComparison, lineSensorDefaults, lineSensorEvaluate, lineSensorOutput, lineSensorStageCurrent, shiftedOutputLoads, validateLineSensorInputs } from '../../sim/LineSensorModel';

describe('three-channel physical-current comparator', () => {
  it.each(Array.from({ length: 8 }, (_, bits) => bits))('resolves independent channel pattern %i from collector KCL', (bits) => {
    const input = { ...lineSensorDefaults, leftPhotocurrentUa: bits & 4 ? 200 : 300, middlePhotocurrentUa: bits & 2 ? 200 : 300, rightPhotocurrentUa: bits & 1 ? 200 : 300 };
    expect(lineSensorEvaluate(5, input, [[], [], []]).channels.map((channel) => channel.high)).toEqual([Boolean(bits & 4), Boolean(bits & 2), Boolean(bits & 1)]);
  });
  it('shares the physical pot reference and keeps a dark collector valid', () => {
    expect(lineSensorComparison(5, 240, 0.4)).toBe(true);
    expect(lineSensorComparison(5, 240, 0.6)).toBe(false);
    expect(lineSensorComparison(5, 0, 0.5)).toBe(true);
    expect(() => lineSensorComparison(5, 0, 0.9)).toThrow('common-mode');
    expect(() => lineSensorComparison(5, 250, 0.5)).toThrow('unresolved');
    expect(() => lineSensorComparison(5, 249, 0.5)).toThrow('unresolved');
    expect(() => lineSensorComparison(5, 500, 0.5)).toThrow('saturation');
  });
  it.each([NaN, Infinity, -1, 401])('rejects invalid detector input %s', (value) => {
    expect(() => validateLineSensorInputs({ ...lineSensorDefaults, leftPhotocurrentUa: value })).toThrow('finite');
  });
  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid shared pot %s', (value) => {
    expect(() => validateLineSensorInputs({ ...lineSensorDefaults, thresholdPosition: value })).toThrow('finite');
  });
  it.each([0, 2.99, 5.11, NaN])('rejects unsupported supply %s', (supply) => {
    expect(() => lineSensorEvaluate(supply, lineSensorDefaults, [[], [], []])).toThrow('3.0..5.1');
  });
  it('scales the detector pullup and pot reference with a 3.3 V supply', () => {
    expect(lineSensorComparison(3.3, 100, 0.5)).toBe(true);
    expect(lineSensorComparison(3.3, 200, 0.5)).toBe(false);
    expect(lineSensorComparison(3.3, 100, 0.2)).toBe(true);
    expect(() => lineSensorComparison(3.3, 300, 0.5)).toThrow('saturation');
    expect(() => lineSensorComparison(3.3, 0, 0.6)).toThrow('common-mode');
    expect(() => lineSensorComparison(3.3, 165, 0.5)).toThrow('unresolved');
    const input = { ...lineSensorDefaults, leftPhotocurrentUa: 100, middlePhotocurrentUa: 200, rightPhotocurrentUa: 100 };
    expect(lineSensorEvaluate(3.3, input, [[], [], []]).channels.map((channel) => channel.high)).toEqual([true, false, true]);
  });
});

describe('nominal asymmetric active output stage', () => {
  const cases = [4.9, 5, 5.1].flatMap((supply) => [false, true].flatMap((high) => [[], [{ voltage: 0, resistance: 10000 }], [{ voltage: 5, resistance: 30000 }], [{ voltage: 0, resistance: 10000 }, { voltage: 5, resistance: 45000 }]].map((loads) => ({ supply, high, loads }))));
  it.each(cases)('preserves loaded logic bounds $supply V / HIGH=$high / $loads', ({ supply, high, loads }) => {
    const output = lineSensorOutput(supply, high, loads);
    expect(output.voltage).toBeGreaterThan(high ? 3.3 : 0.5);
    expect(output.voltage).toBeLessThan(high ? 4.2 : 0.8);
    const residual = lineSensorStageCurrent(supply, output.voltage, high) + loads.reduce((sum, load) => sum + (output.voltage - load.voltage) / load.resistance, 0);
    expect(Math.abs(residual)).toBeLessThan(1e-12);
    const conductance = 1 / output.drive.resistance + loads.reduce((sum, load) => sum + 1 / load.resistance, 0);
    const equivalent = (output.drive.voltage / output.drive.resistance + loads.reduce((sum, load) => sum + load.voltage / load.resistance, 0)) / conductance;
    expect(equivalent).toBeCloseTo(output.voltage, 9);
    expect(output.indicatorCurrent).toBeLessThan(high ? 1e-6 : 0.003);
    if (!high) expect(output.indicatorCurrent).toBeGreaterThan(0.002);
  });
  it('responds asymmetrically to actual loading and finite current limits', () => {
    const noLoad = lineSensorOutput(5, true, []).voltage;
    expect(lineSensorOutput(5, true, [{ voltage: 0, resistance: 10000 }]).voltage).toBeLessThan(noLoad);
    expect(lineSensorOutput(5, true, [{ voltage: 5, resistance: 30000 }]).voltage).toBeGreaterThan(noLoad);
    expect(lineSensorStageCurrent(5, 0, true)).toBeGreaterThan(-0.035);
    expect(lineSensorStageCurrent(5, 5, false)).toBeLessThan(0.021);
    const nominal = lineSensorEvaluate(5, lineSensorDefaults, [[], [], []]);
    expect(nominal.supplyCurrent).toBeGreaterThan(0.07);
    expect(nominal.supplyCurrent).toBeLessThan(0.09);
    expect(lineSensorEvaluate(5, { ...lineSensorDefaults, leftPhotocurrentUa: 300 }, [[], [], []]).supplyCurrent).toBeGreaterThan(nominal.supplyCurrent + 0.002);
  });
  it('keeps the LM324 HIGH dropout at a 3.3 V supply, below 3.3 V CMOS VIH', () => {
    for (const loads of [[], [{ voltage: 3.3, resistance: 30000 }], [{ voltage: 0, resistance: 10000 }]]) {
      const high = lineSensorOutput(3.3, true, loads).voltage;
      expect(high).toBeGreaterThan(2.0);
      expect(high).toBeLessThan(2.3);
      expect(lineSensorOutput(3.3, false, loads).voltage).toBeLessThan(0.8);
    }
    const nominal = lineSensorEvaluate(3.3, { ...lineSensorDefaults, middlePhotocurrentUa: 100 }, [[], [], []]);
    expect(nominal.supplyCurrent).toBeGreaterThan(0.04);
    expect(nominal.supplyCurrent).toBeLessThan(lineSensorEvaluate(5, lineSensorDefaults, [[], [], []]).supplyCurrent);
  });
});

describe('output through a 5 V → 3.3 V level-shifter channel', () => {
  const pullUp = { voltage: 3.3, resistance: 45000 };
  it('loads HIGH with the HV pull-up only, and LOW with both pull-ups and the LVn loads', () => {
    expect(shiftedOutputLoads(true, 5, 3.3, [pullUp])).toEqual([{ voltage: 5, resistance: 10000 }]);
    expect(shiftedOutputLoads(false, 5, 3.3, [pullUp])).toEqual([{ voltage: 5, resistance: 10000 }, { voltage: 3.3, resistance: 10000 }, pullUp]);
  });
  it.each([[[]], [[pullUp]], [[{ voltage: 3.3, resistance: 13000 }]]])('holds HVn at 4.600 V HIGH and below every 3.3 V VIL LOW with LVn loads %j', (lvLoads) => {
    const loads = (high: boolean) => shiftedOutputLoads(high, 5, 3.3, lvLoads);
    const [left, middle] = lineSensorEvaluate(5, { ...lineSensorDefaults, middlePhotocurrentUa: 300 }, [loads, loads, loads]).channels;
    expect(left.high).toBe(true);
    expect(Math.abs(left.voltage - 4.6)).toBeLessThan(0.005);
    expect(middle.high).toBe(false);
    expect(middle.voltage).toBeGreaterThan(0.62);
    expect(middle.voltage).toBeLessThan(0.64);
  });
});
