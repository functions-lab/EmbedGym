import { afterEach, describe, expect, it } from 'vitest';
import { clearPhysicalPinDrives, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { buildNetlist } from '@velxio/simulation/spice/NetlistBuilder';
import { NgSpiceNodeAdapter } from '@velxio/simulation/spice/adapters/NgSpiceNodeAdapter';

afterEach(() => clearPhysicalPinDrives('driver'));
describe('L298N nominal unloaded electrical outputs', () => {
  it('releases coast outputs while retaining flyback clamps and distinct brake rails', async () => {
    const solver = new NgSpiceNodeAdapter(); await solver.init();
    try {
      for (const state of ['high', 'low', 'coast']) {
        setPhysicalPinDrive('driver', 'OUT1', 'l298n', state === 'coast' ? null : { voltage: state === 'high' ? 9 : 0, resistance: state === 'high' ? 1.5 : 0.01 });
        const result = buildNetlist({ components: [{ id: 'driver', metadataId: 'l298n', properties: {} }, { id: 'battery', metadataId: 'battery-9v', properties: {} },
          { id: 'probe', metadataId: 'resistor', properties: { value: '10Meg' } }],
          boards: [{ id: 'board', vcc: 5, pins: {}, groundPinNames: ['GND'], vccPinNames: ['5V'] }],
          wires: [['driver', 'GND', 'board', 'GND'], ['battery', '−', 'board', 'GND'], ['driver', '+12V', 'battery', '+'],
            ['driver', 'OUT1', 'probe', '1'], ['probe', '2', 'board', '5V']].map(([a, ap, b, bp]) => ({ start: { componentId: a, pinName: ap }, end: { componentId: b, pinName: bp } })),
          analysis: { kind: 'op' } });
        expect(result.netlist).toContain('D_driver_OUT1_high'); expect(result.netlist).toContain('D_driver_OUT1_low');
        if (state === 'coast') expect(result.netlist).not.toContain('V_driver_OUT1_l298n');
        await solver.loadCircuit(result.netlist);
        const net = result.pinNetMap.get('driver:OUT1')!;
        const solved = await solver.solve({ kind: 'op' }, { vectorsOfInterest: [`v(${net})`] });
        const voltage = solved.vectors.get(`v(${net})`)!.real[0];
        if (state === 'high') expect(voltage).toBeCloseTo(9, 3);
        else if (state === 'low') expect(voltage).toBeCloseTo(0, 3);
        else if (state === 'coast') expect(voltage).toBeGreaterThan(2);
        else throw new Error('unknown output state');
      }
    } finally { solver.dispose(); }
  });
});
