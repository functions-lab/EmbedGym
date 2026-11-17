import { afterEach, expect, it } from 'vitest';
import { componentToSpice } from '@velxio/simulation/spice/componentToSpice';
import { clearPhysicalPinDrives, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { lineSensorDefaults, lineSensorEvaluate } from '../../sim/LineSensorModel';
import { runNetlist } from '@velxio/__tests__/helpers/testSolver';
import { buildBoardPinNetMap, buildNetlist, buildWireNetMap } from '@velxio/simulation/spice/NetlistBuilder';

afterEach(() => clearPhysicalPinDrives('line'));
it.each([200, 300])('solves actual loaded output and supply-current cards at %i µA', { timeout: 30000 }, async (current) => {
  const fixture = lineSensorEvaluate(5, { ...lineSensorDefaults, leftPhotocurrentUa: current }, [[{ voltage: 0, resistance: 10000 }], [], []]);
  setPhysicalPinDrive('line', 'VCC', 'line-sensor', { voltage: 0, resistance: 5 / fixture.supplyCurrent });
  fixture.channels.forEach((channel, index) => setPhysicalPinDrive('line', ['L', 'M', 'R'][index], 'line-sensor', channel.drive));
  const emission = componentToSpice({ id: 'line', metadataId: 'line-sensor', properties: {} }, (pin) => ({ VCC: 'supply', GND: '0', L: 'left', M: 'middle', R: 'right' })[pin] ?? null, { vcc: 5 })!;
  const result = await runNetlist(['Loaded line sensor', 'V1 supply 0 DC 5', ...emission.cards, 'Rload left 0 10k', '.op', '.end'].join('\n'));
  expect(result.dcValue('v(left)')).toBeGreaterThan(current === 200 ? 3.5 : 0.5);
  expect(result.dcValue('v(left)')).toBeLessThan(current === 200 ? 3.8 : 0.8);
  expect(result.dcValue('v(left)')).toBeCloseTo(fixture.channels[0].voltage, 7);
  expect(-result.dcValue('i(v1)')).toBeGreaterThan(0.07);
  expect(-result.dcValue('i(v1)')).toBeLessThan(0.1);
});

it('preserves the explicitly wired supply resistor in every net-map path', { timeout: 30000 }, async () => {
  setPhysicalPinDrive('line', 'VCC', 'line-sensor', { voltage: 0, resistance: 62.5 });
  const input = {
    components: [
      { id: 'line', metadataId: 'line-sensor', properties: {} },
      { id: 'supply', metadataId: 'resistor', properties: { value: '1' } },
    ],
    boards: [{ id: 'mega', vcc: 5, pins: {}, vccPinNames: ['5V'], groundPinNames: ['GND'] }],
    wires: [
      { id: 'source', start: { componentId: 'mega', pinName: '5V' }, end: { componentId: 'supply', pinName: '1' } },
      { id: 'local', start: { componentId: 'supply', pinName: '2' }, end: { componentId: 'line', pinName: 'VCC' } },
      { id: 'ground', start: { componentId: 'line', pinName: 'GND' }, end: { componentId: 'mega', pinName: 'GND' } },
      { id: 'sense', start: { componentId: 'line', pinName: 'VCC' }, end: { componentId: 'mega', pinName: 'A3' } },
    ],
    analysis: { kind: 'op' as const },
  };
  const built = buildNetlist(input);
  const local = built.pinNetMap.get('line:VCC')!;
  expect(local).not.toBe('vcc_rail');
  expect(built.pinNetMap.get('line:GND')).toBe('0');
  const wires = buildWireNetMap(input);
  expect(wires.get('source')).toBe('vcc_rail');
  expect(wires.get('local')).toBe(local);
  expect(wires.get('ground')).toBe('0');
  const pads = buildBoardPinNetMap(input);
  expect(pads.get('mega:A3')).toBe(local);
  expect(pads.get('mega:5V')).toBe('vcc_rail');
  const solved = await runNetlist(built.netlist);
  expect(solved.dcValue(`v(${local})`)).toBeCloseTo(5 * 62.5 / 63.5, 7);
});
