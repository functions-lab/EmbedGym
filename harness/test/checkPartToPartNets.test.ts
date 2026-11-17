import { describe, it, expect } from 'vitest';
import { checkPartToPartNets, type CircuitLike } from '../jsonl_spec';

describe('checkPartToPartNets', () => {
  it('rejects a part pin wired to another part', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'TOUCH1', metadataId: 'mpr121' },
        { id: 'WATER1', metadataId: 'water-level-sensor' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '20' }, end: { componentId: 'TOUCH1', pinName: 'SDA' } },
        { start: { componentId: 'TOUCH1', pinName: '4' },        end: { componentId: 'WATER1', pinName: 'signal' } },
      ],
    };
    expect(() => checkPartToPartNets(circuit, 'arduino-mega'))
      .toThrow(/a net with no board pin joins 2 parts: TOUCH1 \(mpr121\) via 4, WATER1 \(water-level-sensor\) via signal/);
  });

  it('rejects two parts joined through a resistor', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'DRV1', metadataId: 'l298n' },
        { id: 'R1', metadataId: 'resistor' },
        { id: 'L1', metadataId: 'led' },
      ],
      wires: [
        { start: { componentId: 'DRV1', pinName: 'OUT1' },      end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' },           end: { componentId: 'L1', pinName: 'A' } },
        { start: { componentId: 'L1', pinName: 'C' },           end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(() => checkPartToPartNets(circuit, 'arduino-mega'))
      .toThrow(/joins 2 parts: DRV1 \(l298n\) via OUT1, L1 \(led\) via A/);
  });

  it('accepts a supply part feeding a part', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'DRV1', metadataId: 'l298n' },
        { id: 'BAT1', metadataId: 'battery-9v' },
      ],
      wires: [
        { start: { componentId: 'BAT1', pinName: '+' },         end: { componentId: 'DRV1', pinName: '+12V' } },
        { start: { componentId: 'BAT1', pinName: '−' },         end: { componentId: 'arduino-mega', pinName: 'GND' } },
        { start: { componentId: 'DRV1', pinName: 'GND' },       end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(() => checkPartToPartNets(circuit, 'arduino-mega')).not.toThrow();
  });

  it('accepts a part pin wired to its own pin through a resistor', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'TOUCH1', metadataId: 'mpr121' },
        { id: 'R1', metadataId: 'resistor' },
      ],
      wires: [
        { start: { componentId: 'TOUCH1', pinName: '6' },       end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' },           end: { componentId: 'TOUCH1', pinName: '3Vo' } },
      ],
    };
    expect(() => checkPartToPartNets(circuit, 'arduino-mega')).not.toThrow();
  });

  it('accepts parts that meet only on board pins', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'R1', metadataId: 'resistor' },
        { id: 'L1', metadataId: 'led' },
        { id: 'B1', metadataId: 'buzzer' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '13' }, end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' },            end: { componentId: 'L1', pinName: 'A' } },
        { start: { componentId: 'L1', pinName: 'C' },            end: { componentId: 'arduino-mega', pinName: 'GND' } },
        { start: { componentId: 'arduino-mega', pinName: '11' }, end: { componentId: 'B1', pinName: '1' } },
        { start: { componentId: 'B1', pinName: '2' },            end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(() => checkPartToPartNets(circuit, 'arduino-mega')).not.toThrow();
  });
});
