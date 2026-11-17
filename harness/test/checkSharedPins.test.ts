import { describe, it, expect } from 'vitest';
import { checkSharedPins, type CircuitLike } from '../jsonl_spec';

describe('checkSharedPins', () => {
  it('rejects a signal pin wired to two parts', () => {
    // safebox_display's ESP pinout before the fix: the relay input and the
    // keypad's C2 column both on GPIO12.
    const circuit: CircuitLike = {
      components: [
        { id: 'KP1', metadataId: 'membrane-keypad' },
        { id: 'RLY1', metadataId: 'relay-module' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '12' }, end: { componentId: 'KP1', pinName: 'C2' } },
        { start: { componentId: 'esp32-s3', pinName: '12' }, end: { componentId: 'RLY1', pinName: 'IN' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'esp32-s3'))
      .toThrow(/board pin 12 is wired to 2 parts: KP1 \(membrane-keypad\) via C2, RLY1 \(relay-module\) via IN/);
  });

  it('accepts a button with its pull-down resistor on the same pin', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'BTN1', metadataId: 'pushbutton' },
        { id: 'R_PD', metadataId: 'resistor-10k' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '12' }, end: { componentId: 'BTN1', pinName: '1.l' } },
        { start: { componentId: 'esp32-s3', pinName: '12' }, end: { componentId: 'R_PD', pinName: '1' } },
        { start: { componentId: 'R_PD', pinName: '2' },      end: { componentId: 'esp32-s3', pinName: 'GND.1' } },
        { start: { componentId: 'BTN1', pinName: '2.l' },    end: { componentId: 'esp32-s3', pinName: '3V3.1' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'esp32-s3')).not.toThrow();
  });

  it('accepts an LED behind a series resistor', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'R1', metadataId: 'resistor' },
        { id: 'L1', metadataId: 'led' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '13' }, end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' },            end: { componentId: 'L1', pinName: 'A' } },
        { start: { componentId: 'L1', pinName: 'C' },            end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'arduino-mega')).not.toThrow();
  });

  it('accepts one part spanning many board pins', () => {
    const nodes = ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'];
    const circuit: CircuitLike = {
      components: [{ id: 'KP1', metadataId: 'membrane-keypad' }],
      wires: nodes.map((node, i) => ({
        start: { componentId: 'esp32-s3', pinName: String(9 + i) },
        end: { componentId: 'KP1', pinName: node },
      })),
    };
    expect(() => checkSharedPins(circuit, 'esp32-s3')).not.toThrow();
  });

  it('counts a part reached twice from one pin only once', () => {
    const circuit: CircuitLike = {
      components: [{ id: 'LCD1', metadataId: 'lcd1602' }],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '7' }, end: { componentId: 'LCD1', pinName: 'RS' } },
        { start: { componentId: 'arduino-mega', pinName: '7' }, end: { componentId: 'LCD1', pinName: 'E' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'arduino-mega')).not.toThrow();
  });

  it('ignores rail pins feeding every part in the circuit', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'RLY1', metadataId: 'relay-module' },
        { id: 'LCD1', metadataId: 'lcd1602' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '5V' },  end: { componentId: 'RLY1', pinName: 'VCC' } },
        { start: { componentId: 'arduino-mega', pinName: '5V' },  end: { componentId: 'LCD1', pinName: 'VDD' } },
        { start: { componentId: 'arduino-mega', pinName: 'GND' }, end: { componentId: 'RLY1', pinName: 'GND' } },
        { start: { componentId: 'arduino-mega', pinName: 'GND' }, end: { componentId: 'LCD1', pinName: 'VSS' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'arduino-mega')).not.toThrow();
  });

  it('does not treat two parts sharing a ground return as sharing a signal pin', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'R1', metadataId: 'resistor' },
        { id: 'L1', metadataId: 'led' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '13' }, end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' },            end: { componentId: 'arduino-mega', pinName: 'GND' } },
        { start: { componentId: 'arduino-mega', pinName: '5' },  end: { componentId: 'L1', pinName: 'A' } },
        { start: { componentId: 'L1', pinName: 'C' },            end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'arduino-mega')).not.toThrow();
  });

  it('reports every offending pin at once', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'L1', metadataId: 'led' },
        { id: 'L2', metadataId: 'led' },
        { id: 'B1', metadataId: 'buzzer' },
        { id: 'B2', metadataId: 'buzzer' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '3' }, end: { componentId: 'L1', pinName: 'A' } },
        { start: { componentId: 'arduino-mega', pinName: '3' }, end: { componentId: 'L2', pinName: 'A' } },
        { start: { componentId: 'arduino-mega', pinName: '4' }, end: { componentId: 'B1', pinName: '1' } },
        { start: { componentId: 'arduino-mega', pinName: '4' }, end: { componentId: 'B2', pinName: '1' } },
      ],
    };
    expect(() => checkSharedPins(circuit, 'arduino-mega')).toThrow(/board pin 3 .*; board pin 4 /);
  });

  describe('I2C bus', () => {
    const bus = (parts: { id: string; metadataId: string }[], extra: CircuitLike['wires'] = []): CircuitLike => ({
      components: parts,
      wires: [
        ...parts.flatMap((p) => [
          { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: p.id, pinName: 'SDA' } },
          { start: { componentId: 'esp32-s3', pinName: '39' }, end: { componentId: p.id, pinName: 'SCL' } },
        ]),
        ...extra,
      ],
    });

    it('accepts distinct parts sharing SDA/SCL', () => {
      const circuit = bus([{ id: 'AIR1', metadataId: 'pmsa003i' }, { id: 'GAS1', metadataId: 'sgp40' }]);
      expect(() => checkSharedPins(circuit, 'esp32-s3')).not.toThrow();
    });

    it('rejects two parts of the same type on the bus', () => {
      const circuit = bus([{ id: 'GAS1', metadataId: 'sgp40' }, { id: 'GAS2', metadataId: 'sgp40' }]);
      expect(() => checkSharedPins(circuit, 'esp32-s3'))
        .toThrow(/board pin 38 is an I2C bus with two parts of the same type: GAS1 \(sgp40\) via SDA, GAS2 \(sgp40\) via SDA/);
    });

    it('rejects a non-I2C part pin on the SDA net', () => {
      const circuit = bus(
        [{ id: 'GAS1', metadataId: 'sgp40' }],
        [{ start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'L1', pinName: 'A' } }],
      );
      circuit.components.push({ id: 'L1', metadataId: 'led' });
      expect(() => checkSharedPins(circuit, 'esp32-s3'))
        .toThrow(/board pin 38 is wired to 2 parts: GAS1 \(sgp40\) via SDA, L1 \(led\) via A/);
    });

    it('rejects a single-wire data pin named SDA on the bus', () => {
      const circuit = bus(
        [{ id: 'AIR1', metadataId: 'pmsa003i' }],
        [{ start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'DHT1', pinName: 'SDA' } }],
      );
      circuit.components.push({ id: 'DHT1', metadataId: 'dht22' });
      expect(() => checkSharedPins(circuit, 'esp32-s3'))
        .toThrow(/board pin 38 is wired to 2 parts: AIR1 \(pmsa003i\) via SDA, DHT1 \(dht22\) via SDA/);
    });

    it('accepts distinct parts sharing SDA/SCL behind two level-shifter channels', () => {
      const circuit: CircuitLike = {
        components: [
          { id: 'LS1', metadataId: 'level-shifter' },
          { id: 'RTC1', metadataId: 'ds1307' },
          { id: 'GAS1', metadataId: 'sgp40' },
        ],
        wires: [
          { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'LS1', pinName: 'LV1' } },
          { start: { componentId: 'esp32-s3', pinName: '39' }, end: { componentId: 'LS1', pinName: 'LV2' } },
          ...['RTC1', 'GAS1'].flatMap((id) => [
            { start: { componentId: 'LS1', pinName: 'HV1' }, end: { componentId: id, pinName: 'SDA' } },
            { start: { componentId: 'LS1', pinName: 'HV2' }, end: { componentId: id, pinName: 'SCL' } },
          ]),
        ],
      };
      expect(() => checkSharedPins(circuit, 'esp32-s3')).not.toThrow();
    });
  });

  describe('level shifter', () => {
    // GPIO 12 → LS1 LV1 ⇄ HV1 → first part; GPIO 13 → LV2 ⇄ HV2 → second part.
    const shifted = (secondHv: string): CircuitLike => ({
      components: [
        { id: 'LS1', metadataId: 'level-shifter' },
        { id: 'US1', metadataId: 'hc-sr04' },
        { id: 'RLY1', metadataId: 'relay-module' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '12' }, end: { componentId: 'LS1', pinName: 'LV1' } },
        { start: { componentId: 'LS1', pinName: 'HV1' },     end: { componentId: 'US1', pinName: 'ECHO' } },
        { start: { componentId: 'esp32-s3', pinName: '13' }, end: { componentId: 'LS1', pinName: 'LV2' } },
        { start: { componentId: 'LS1', pinName: secondHv },  end: { componentId: 'RLY1', pinName: 'IN' } },
        { start: { componentId: 'esp32-s3', pinName: '5V' }, end: { componentId: 'LS1', pinName: 'HV' } },
        { start: { componentId: 'esp32-s3', pinName: '3V3.1' }, end: { componentId: 'LS1', pinName: 'LV' } },
      ],
    });

    it('accepts two channels driving two parts', () => {
      expect(() => checkSharedPins(shifted('HV2'), 'esp32-s3')).not.toThrow();
    });

    it('rejects two parts behind one channel', () => {
      expect(() => checkSharedPins(shifted('HV1'), 'esp32-s3'))
        .toThrow(/board pin 12 is wired to 2 parts: US1 \(hc-sr04\) via ECHO, RLY1 \(relay-module\) via IN/);
    });
  });
});
