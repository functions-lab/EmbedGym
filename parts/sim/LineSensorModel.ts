import type { PinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { LEVEL_SHIFTER_PULLUP_OHMS } from '@velxio/simulation/levelShifter';

export interface LineSensorInputs {
  leftPhotocurrentUa: number;
  middlePhotocurrentUa: number;
  rightPhotocurrentUa: number;
  thresholdPosition: number;
}
export const lineSensorDefaults: LineSensorInputs = {
  leftPhotocurrentUa: 200, middlePhotocurrentUa: 200, rightPhotocurrentUa: 200, thresholdPosition: 0.5,
};

export function validateLineSensorInputs(input: LineSensorInputs): void {
  for (const key of ['leftPhotocurrentUa', 'middlePhotocurrentUa', 'rightPhotocurrentUa'] as const) {
    if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 400) throw new Error(`line-sensor: ${key} must be finite within 0..400 µA`);
  }
  if (!Number.isFinite(input.thresholdPosition) || input.thresholdPosition < 0 || input.thresholdPosition > 1) throw new Error('line-sensor: thresholdPosition must be finite within 0..1');
}

export function lineSensorComparison(supply: number, photocurrentUa: number, position: number): boolean {
  const collector = supply - photocurrentUa * 0.01;
  const reference = supply * position;
  if (collector < 0.8) throw new Error('line-sensor: detector saturation is outside the nominal model');
  if (Math.min(collector, reference) > supply - 1.5) throw new Error('line-sensor: both comparator inputs exceed the common-mode range');
  if (position < 0.2 || position > 0.6) throw new Error('line-sensor: nominal shared pot requires 0.2..0.6 (1..3V at 5V)');
  if (Math.abs(collector - reference) < 0.05) throw new Error('line-sensor: comparator difference is within the unresolved 50mV margin');
  return collector > reference;
}

function bisect(fn: (value: number) => number, low: number, high: number): number {
  if (fn(low) > 0 || fn(high) < 0) throw new Error('line-sensor: current balance is outside the nominal rails');
  for (let i = 0; i < 60; i++) {
    const middle = (low + high) / 2;
    if (fn(middle) > 0) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}

function diodeCurrent(voltage: number, resistance: number, saturation: number, thermal: number): number {
  if (voltage <= 0) return 0;
  return bisect((current) => current * resistance + thermal * Math.log1p(current / saturation) - voltage, 0, voltage / resistance);
}

// Independent nominal 25°C approximation of the LM324 family topology in
// TI SLOA277B §§3.1–3.4: Darlington source, PNP sink and always-on weak sink.
// Junction parameters, 30/20mA limits and LED parts are model conventions.
export function lineSensorStageCurrent(supply: number, output: number, high: boolean): number {
  const weakSink = 40e-6 * Math.tanh(output / 0.025);
  const source = high ? 0.03 * Math.tanh(1e-14 * Math.expm1((supply - output) / 0.052) / 0.03) : 0;
  const sink = high ? 0 : 0.02 * Math.tanh(1e-13 * Math.expm1(output / 0.026) / 0.02);
  const indicator = diodeCurrent(supply - output, 1000, 1e-20, 0.044);
  return weakSink + sink - source - indicator;
}

export function lineSensorOutput(supply: number, high: boolean, loads: readonly PinDrive[]): { voltage: number; drive: PinDrive; supplyCurrent: number; indicatorCurrent: number } {
  for (const load of loads) {
    if (!Number.isFinite(load.voltage) || !Number.isFinite(load.resistance) || load.resistance <= 0 || load.voltage < 0 || load.voltage > supply + 0.1) throw new Error('line-sensor: unsupported output load');
  }
  const residual = (voltage: number) => lineSensorStageCurrent(supply, voltage, high) + loads.reduce((sum, load) => sum + (voltage - load.voltage) / load.resistance, 0);
  const voltage = bisect(residual, 0, supply);
  const current = lineSensorStageCurrent(supply, voltage, high);
  const conductance = (lineSensorStageCurrent(supply, voltage + 1e-5, high) - lineSensorStageCurrent(supply, voltage - 1e-5, high)) / 2e-5;
  if (!(conductance > 0)) throw new Error('line-sensor: output operating point is not stable');
  const indicatorCurrent = diodeCurrent(supply - voltage, 1000, 1e-20, 0.044);
  const sourceCurrent = high ? 0.03 * Math.tanh(1e-14 * Math.expm1((supply - voltage) / 0.052) / 0.03) : 0;
  return { voltage, drive: { voltage: voltage - current / conductance, resistance: 1 / conductance }, supplyCurrent: indicatorCurrent + sourceCurrent, indicatorCurrent };
}

// 3.0 V is the LM324-family minimum supply (TI SLOS066); 5.1 V tops the
// module's nominal 5 V. Every stage above scales with the supply.
export function validateLineSensorSupply(supply: number): void {
  if (!Number.isFinite(supply) || supply < 3.0 || supply > 5.1) throw new Error('line-sensor: nominal model requires 3.0..5.1V, 25°C');
}

// An output wired to HVn of a BSS138 level-shifter channel. HIGH leaves the
// FET off (LVn pulled to LV, so Vgs ≈ 0): only the HV pull-up loads the
// output. LOW turns it on, adding the LV pull-up and the LVn loads through its
// ~1 Ω channel, which is negligible against the ≥10 kΩ pulls.
export function shiftedOutputLoads(high: boolean, hv: number, lv: number, lvLoads: readonly PinDrive[]): PinDrive[] {
  const hvPull = { voltage: hv, resistance: LEVEL_SHIFTER_PULLUP_OHMS };
  if (high) return [hvPull];
  return [hvPull, { voltage: lv, resistance: LEVEL_SHIFTER_PULLUP_OHMS }, ...lvLoads];
}

// Each output's loads, or a function of its comparator state for loads that
// change with it (a level-shifter channel).
export type LineSensorLoads = readonly PinDrive[] | ((high: boolean) => readonly PinDrive[]);

export function lineSensorEvaluate(supply: number, input: LineSensorInputs, loads: readonly LineSensorLoads[]) {
  validateLineSensorInputs(input);
  validateLineSensorSupply(supply);
  if (loads.length !== 3) throw new Error('line-sensor: expected three load networks');
  const currents = [input.leftPhotocurrentUa, input.middlePhotocurrentUa, input.rightPhotocurrentUa];
  const channels = currents.map((current, index) => {
    const high = lineSensorComparison(supply, current, input.thresholdPosition);
    const channelLoads = loads[index];
    return { high, ...lineSensorOutput(supply, high, typeof channelLoads === 'function' ? channelLoads(high) : channelLoads) };
  });
  // Three continuous IR emitters with schematic 150Ω resistors, the 10kΩ
  // pot, detector pullups, nominal green indicator and amplifier idle current.
  const idleCurrent = 3 * diodeCurrent(supply, 150, 1e-12, 0.052) + supply / 10000 + currents.reduce((sum, current) => sum + current * 1e-6, 0) + diodeCurrent(supply, 1000, 1e-22, 0.049) + 700e-6;
  return { channels, supplyVoltage: supply, supplyCurrent: idleCurrent + channels.reduce((sum, channel) => sum + channel.supplyCurrent, 0) };
}
