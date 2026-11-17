/**
 * A 5 V line sensor behind a BSS138 level shifter on real ngspice: the
 * TypeScript operating point (shiftedOutputLoads) must be the one the solver
 * finds at HVn, and the shifter must hand the GPIO a clean 3.3 V level.
 */
import { afterEach, expect, it } from 'vitest';
import { clearPhysicalPinDrives, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { lineSensorDefaults, lineSensorEvaluate, shiftedOutputLoads } from '../../sim/LineSensorModel';
import { buildNetlist } from '@velxio/simulation/spice/NetlistBuilder';
import { boardForSpice } from '@velxio/simulation/spice/storeAdapter';
import { runNetlist } from '@velxio/__tests__/helpers/testSolver';

afterEach(() => clearPhysicalPinDrives('line'));

it.each([0, 1] as const)('solves the shifted outputs where the model puts them (GPIO pull %i)', { timeout: 30_000 }, async (pull) => {
  const lvLoads = pull ? [{ voltage: 3.3, resistance: 45_000 }] : [];
  const loads = (high: boolean) => shiftedOutputLoads(high, 5, 3.3, lvLoads);
  const fixture = lineSensorEvaluate(5, { ...lineSensorDefaults, middlePhotocurrentUa: 300 }, [loads, loads, loads]);
  setPhysicalPinDrive('line', 'VCC', 'line-sensor', { voltage: 0, resistance: 5 / fixture.supplyCurrent });
  fixture.channels.forEach((channel, i) => setPhysicalPinDrive('line', ['L', 'M', 'R'][i], 'line-sensor', channel.drive));
  const links: Array<[string, string, string, string]> = [
    ['esp', '5V', 'line', 'VCC'], ['line', 'GND', 'esp', 'GND.1'],
    ['esp', '5V', 'ls', 'HV'], ['esp', '3V3.1', 'ls', 'LV'], ['ls', 'GND.1', 'esp', 'GND.1'],
    ['line', 'L', 'ls', 'HV1'], ['line', 'M', 'ls', 'HV2'], ['line', 'R', 'ls', 'HV3'],
    ['ls', 'LV1', 'esp', '12'], ['ls', 'LV2', 'esp', '13'], ['ls', 'LV3', 'esp', '14'],
  ];
  const built = buildNetlist({
    components: [
      { id: 'line', metadataId: 'line-sensor', properties: {} },
      { id: 'ls', metadataId: 'level-shifter', properties: {} },
    ],
    wires: links.map(([a, ap, b, bp], i) => ({ id: `w${i}`, start: { componentId: a, pinName: ap }, end: { componentId: b, pinName: bp } })),
    boards: [boardForSpice('esp', 'esp32-s3', { 12: { type: 'input', pull }, 13: { type: 'input', pull }, 14: { type: 'input', pull } })],
    analysis: { kind: 'op' },
  });
  const solved = await runNetlist(built.netlist);
  const volts = (pin: string) => solved.dcValue(`v(${built.pinNetMap.get(pin)})`);
  fixture.channels.forEach((channel, i) => {
    expect(Math.abs(volts(`ls:HV${i + 1}`) - channel.voltage)).toBeLessThan(1e-4);
    if (channel.high) expect(volts(`esp:${12 + i}`)).toBeGreaterThan(3.29);
    else expect(volts(`esp:${12 + i}`)).toBeLessThan(0.7);
  });
  expect(fixture.channels.map((channel) => channel.high)).toEqual([true, false, true]);
});
