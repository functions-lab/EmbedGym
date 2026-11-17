import { describe, expect, it } from 'vitest';
import { physicalPinConnections, railDrive } from '../../sim/physicalPinConnections';

describe('physicalPinConnections', () => {
  it('traces passive pull resistors without treating them as ideal wires', () => {
    const circuit = { boards: [{ id: 'board', boardKind: 'arduino-mega' }], components: [{ id: 'pull', metadataId: 'resistor', properties: { value: '10k' } }],
      wires: [{ start: { componentId: 'sensor', pinName: '4' }, end: { componentId: 'pull', pinName: '1' } },
        { start: { componentId: 'pull', pinName: '2' }, end: { componentId: 'board', pinName: 'GND' } }] };
    const path = physicalPinConnections(circuit, 'sensor', '4'); expect(path).toHaveLength(1);
    expect(railDrive(circuit, path[0])).toEqual({ voltage: 0, resistance: 10000 });
  });
  it('rejects coupled resistor forks instead of treating the shared branch as two independent resistances', () => {
    const circuit = { boards: [{ id: 'board', boardKind: 'arduino-mega' }], components: [
      { id: 'common', metadataId: 'resistor', properties: { value: '10k' } },
      { id: 'a', metadataId: 'resistor', properties: { value: '10k' } }, { id: 'b', metadataId: 'resistor', properties: { value: '10k' } }],
      wires: [ ['sensor', '4', 'common', '1'], ['common', '2', 'a', '1'], ['common', '2', 'b', '1'], ['a', '2', 'board', '5V'], ['b', '2', 'board', 'GND'] ].map(([a, ap, b, bp]) => ({ start: { componentId: a, pinName: ap }, end: { componentId: b, pinName: bp } })) };
    expect(() => physicalPinConnections(circuit, 'sensor', '4')).toThrow('coupled resistor');
  });
});
