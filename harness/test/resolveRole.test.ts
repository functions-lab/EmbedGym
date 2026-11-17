import { describe, it, expect } from 'vitest';
import { resolveRole, resolveUnwiredRole, type CircuitLike } from '../jsonl_spec';

// Standard AVR-blink shape: board pin 13 → resistor R1 → LED L1 → GND.
// resolveRole must trace through R1 to reach L1.
const ledThroughResistor: CircuitLike = {
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

describe('resolveRole', () => {
  it('finds a component wired directly to the signal pin', () => {
    const circuit: CircuitLike = {
      components: [{ id: 'B1', metadataId: 'buzzer' }],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '11' }, end: { componentId: 'B1', pinName: '1' } },
        { start: { componentId: 'B1', pinName: '2' }, end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(resolveRole(circuit, 'arduino-mega', '11', 'buzzer')).toBe('B1');
  });

  it('traces through a pass-through resistor to reach the LED', () => {
    expect(resolveRole(ledThroughResistor, 'arduino-mega', '13', 'led')).toBe('L1');
  });

  it('does not walk into a non-matching component and out of it as if it were the target', () => {
    // resistor is not the target part, and there is no LED anywhere.
    const circuit: CircuitLike = {
      components: [{ id: 'R1', metadataId: 'resistor' }],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '13' }, end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' }, end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(() => resolveRole(circuit, 'arduino-mega', '13', 'led'))
      .toThrow(/no 'led' component reachable/);
  });

  it('does not reach a part wired only to another part', () => {
    // A water level sensor on the MPR121's electrode 4: it reaches no board signal pin.
    const circuit: CircuitLike = {
      components: [
        { id: 'TOUCH1', metadataId: 'mpr121' },
        { id: 'WATER1', metadataId: 'water-level-sensor' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '20' }, end: { componentId: 'TOUCH1', pinName: 'SDA' } },
        { start: { componentId: 'arduino-mega', pinName: '21' }, end: { componentId: 'TOUCH1', pinName: 'SCL' } },
        { start: { componentId: 'TOUCH1', pinName: '4' },        end: { componentId: 'WATER1', pinName: 'signal' } },
      ],
    };
    expect(() => resolveRole(circuit, 'arduino-mega', '20', 'water-level-sensor'))
      .toThrow(/no 'water-level-sensor' component reachable from board pin 20/);
  });

  it('throws when the signal pin has no wire at all', () => {
    expect(() => resolveRole(ledThroughResistor, 'arduino-mega', '7', 'led'))
      .toThrow(/no 'led' component reachable from board pin 7/);
  });

  it('does not reach a part through the GND rail', () => {
    // R1 returns to GND and so does the LED. Tracing pin 13 must stop at the
    // rail rather than arriving at L1 through every other part's return path.
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
    expect(() => resolveRole(circuit, 'arduino-mega', '13', 'led'))
      .toThrow(/no 'led' component reachable from board pin 13/);
  });

  it('prefers the reachable component of matching metadataId over an unreachable one', () => {
    // Two LEDs: L_wrong is wired to pin 5, L_right to pin 13. Query for pin 13
    // must resolve to L_right even though L_wrong appears earlier.
    const circuit: CircuitLike = {
      components: [
        { id: 'L_wrong', metadataId: 'led' },
        { id: 'L_right', metadataId: 'led' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '5' },  end: { componentId: 'L_wrong', pinName: 'A' } },
        { start: { componentId: 'L_wrong', pinName: 'C' },       end: { componentId: 'arduino-mega', pinName: 'GND' } },
        { start: { componentId: 'arduino-mega', pinName: '13' }, end: { componentId: 'L_right', pinName: 'A' } },
        { start: { componentId: 'L_right', pinName: 'C' },       end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(resolveRole(circuit, 'arduino-mega', '13', 'led')).toBe('L_right');
  });
  it('resolves each distinct part on a shared I2C bus', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'AIR1', metadataId: 'pmsa003i' },
        { id: 'GAS1', metadataId: 'sgp40' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'AIR1', pinName: 'SDA' } },
        { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'GAS1', pinName: 'SDA' } },
      ],
    };
    expect(resolveRole(circuit, 'esp32-s3', '38', 'pmsa003i')).toBe('AIR1');
    expect(resolveRole(circuit, 'esp32-s3', '38', 'sgp40')).toBe('GAS1');
  });

  it('throws when the pin reaches two parts of the requested type', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'GAS1', metadataId: 'sgp40' },
        { id: 'GAS2', metadataId: 'sgp40' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'GAS1', pinName: 'SDA' } },
        { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'GAS2', pinName: 'SDA' } },
      ],
    };
    expect(() => resolveRole(circuit, 'esp32-s3', '38', 'sgp40'))
      .toThrow(/board pin 38 reaches 2 'sgp40' components: GAS1, GAS2/);
  });

  // GPIO 44 → LS1 LV1 ⇄ HV1 → US1 ECHO; the shifter's supplies on 5V / 3V3.1.
  const shifted = (echoPin: string): CircuitLike => ({
    components: [
      { id: 'US1', metadataId: 'hc-sr04' },
      { id: 'LS1', metadataId: 'level-shifter' },
    ],
    wires: [
      { start: { componentId: 'esp32-s3', pinName: '44' },  end: { componentId: 'LS1', pinName: 'LV1' } },
      { start: { componentId: 'LS1', pinName: echoPin },    end: { componentId: 'US1', pinName: 'ECHO' } },
      { start: { componentId: 'esp32-s3', pinName: '5V' },  end: { componentId: 'LS1', pinName: 'HV' } },
      { start: { componentId: 'esp32-s3', pinName: '3V3.1' }, end: { componentId: 'LS1', pinName: 'LV' } },
      { start: { componentId: 'LS1', pinName: 'GND.1' },    end: { componentId: 'esp32-s3', pinName: 'GND.1' } },
    ],
  });

  it('traces through one level-shifter channel', () => {
    expect(resolveRole(shifted('HV1'), 'esp32-s3', '44', 'hc-sr04')).toBe('US1');
  });

  it('does not cross between level-shifter channels or through HV, LV and GND', () => {
    for (const pin of ['HV2', 'HV', 'LV', 'GND.1']) {
      expect(() => resolveRole(shifted(pin), 'esp32-s3', '44', 'hc-sr04'))
        .toThrow(/no 'hc-sr04' component reachable from board pin 44/);
    }
  });
});

describe('resolveUnwiredRole', () => {
  const led = [
    { start: { componentId: 'esp32-s3', pinName: '10' }, end: { componentId: 'L1', pinName: 'A' } },
    { start: { componentId: 'L1', pinName: 'C' },        end: { componentId: 'esp32-s3', pinName: 'GND.1' } },
  ];

  it('resolves to the single component of that part', () => {
    const circuit: CircuitLike = {
      components: [{ id: 'L1', metadataId: 'led' }, { id: 'W1', metadataId: 'wifi' }],
      wires: led,
    };
    expect(resolveUnwiredRole(circuit, 'wifi')).toBe('W1');
  });

  it('works on a circuit with no wires at all', () => {
    const circuit: CircuitLike = { components: [{ id: 'W1', metadataId: 'wifi' }], wires: [] };
    expect(resolveUnwiredRole(circuit, 'wifi')).toBe('W1');
  });

  it('resolves a ble part the same way', () => {
    const circuit: CircuitLike = { components: [{ id: 'B1', metadataId: 'ble' }], wires: [] };
    expect(resolveUnwiredRole(circuit, 'ble')).toBe('B1');
  });

  it('rejects an unwired part that has wires', () => {
    const circuit: CircuitLike = {
      components: [{ id: 'W1', metadataId: 'wifi' }],
      wires: [{ start: { componentId: 'esp32-s3', pinName: '10' }, end: { componentId: 'W1', pinName: 'X' } }],
    };
    expect(() => resolveUnwiredRole(circuit, 'wifi')).toThrow(/'W1' \(wifi\) has wires/);
  });

  it('rejects a board-wired part type even when this instance has no wires', () => {
    const circuit: CircuitLike = { components: [{ id: 'L1', metadataId: 'led' }], wires: [] };
    expect(() => resolveUnwiredRole(circuit, 'led')).toThrow(/'led' is wired to the board/);
  });

  it('rejects zero or two components of that part', () => {
    const none: CircuitLike = { components: [{ id: 'L1', metadataId: 'led' }], wires: led };
    expect(() => resolveUnwiredRole(none, 'wifi')).toThrow(/exactly one 'wifi' component, found 0/);
    const two: CircuitLike = {
      components: [{ id: 'W1', metadataId: 'wifi' }, { id: 'W2', metadataId: 'wifi' }],
      wires: [],
    };
    expect(() => resolveUnwiredRole(two, 'wifi')).toThrow(/exactly one 'wifi' component, found 2/);
  });
});
