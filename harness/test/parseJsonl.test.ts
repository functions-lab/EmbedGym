import { describe, it, expect } from 'vitest';
import {
  parseJsonl,
  isCircuitRow,
  isExpectRow,
  isSetRow,
  isDoRow,
  isPeerRow,
} from '../jsonl_spec';

const AVR = 'atmega2560_arduino';
const ESP = 'esp32s3_espidf';
const NRF = 'nrf52840_zephyr';

describe('parseJsonl', () => {
  it('parses a mix of circuit, expect, set, and do rows', () => {
    const text = [
      `{"target": "${AVR}", "part": "led", "name": "led_red", "pin": 3}`,
      `{"target": "${AVR}", "part": "led", "name": "led_green", "pin": 4}`,
      '{"at": 500, "expect": "led_red.value == true"}',
      '{"at": 600, "set": "temp.temperature = 30"}',
      '{"at": 700, "do": "button.down"}',
    ].join('\n');
    const rows = parseJsonl(text, AVR);
    expect(rows).toHaveLength(5);
    expect(rows.filter(isCircuitRow)).toHaveLength(2);
    expect(rows.filter(isExpectRow)).toHaveLength(1);
    expect(rows.filter(isSetRow)).toHaveLength(1);
    expect(rows.filter(isDoRow)).toHaveLength(1);
  });

  it('preserves pin type (number stays number, string stays string)', () => {
    const text = [
      `{"target": "${AVR}", "part": "led", "name": "l", "pin": 3}`,
      `{"target": "${AVR}", "part": "led", "name": "a", "pin": "A0"}`,
    ].join('\n');
    const circuit = parseJsonl(text, AVR).filter(isCircuitRow);
    expect(circuit[0].pin).toBe(3);
    expect(circuit[1].pin).toBe('A0');
  });

  it('skips blank lines', () => {
    const text = '\n{"at": 100, "expect": "x.value == true"}\n\n';
    expect(parseJsonl(text, AVR)).toHaveLength(1);
  });

  it('rejects invalid JSON with a line number', () => {
    expect(() => parseJsonl('{"part":', AVR)).toThrow(/line 1: invalid JSON/);
  });

  it('rejects rows that fit no recognized shape', () => {
    expect(() => parseJsonl('{"foo": "bar"}', AVR)).toThrow(/unrecognized row shape/);
  });
});

describe('parseJsonl (target selection)', () => {
  // Both targets' bindings live in one file on adjacent lines; the selected
  // target's survive and the others vanish.
  const text = [
    `{"target": "${AVR}", "part": "led", "name": "led", "pin": 3}`,
    `{"target": "${ESP}", "part": "led", "name": "led", "pin": 10}`,
    '{"at": 250, "expect": "led.value == true"}',
  ].join('\n');

  it('keeps only the selected target\'s circuit rows', () => {
    const avr = parseJsonl(text, AVR).filter(isCircuitRow);
    expect(avr).toHaveLength(1);
    expect(avr[0].pin).toBe(3);

    const esp = parseJsonl(text, ESP).filter(isCircuitRow);
    expect(esp).toHaveLength(1);
    expect(esp[0].pin).toBe(10);
  });

  it('keeps assertion rows for every target', () => {
    expect(parseJsonl(text, AVR).filter(isExpectRow)).toHaveLength(1);
    expect(parseJsonl(text, ESP).filter(isExpectRow)).toHaveLength(1);
  });

  it('rejects a circuit row with no target', () => {
    expect(() => parseJsonl('{"part": "led", "name": "l", "pin": 3}', AVR))
      .toThrow(/circuit row needs a "target"/);
  });

  it('rejects a target on a non-circuit row', () => {
    expect(() => parseJsonl(`{"target": "${AVR}", "at": 1, "expect": "l.value == true"}`, AVR))
      .toThrow(/only circuit and peer rows are target-specific/);
  });

  it('rejects a circuit row naming a target the task does not declare', () => {
    const stray = `{"target": "stm32f4_hal", "part": "led", "name": "l", "pin": 1}`;
    expect(() => parseJsonl(stray, AVR, [AVR, ESP, NRF]))
      .toThrow(/unknown target 'stm32f4_hal'/);
  });

  it('keeps an nrf52840_zephyr row when the task declares that target', () => {
    const row = `{"target": "${NRF}", "part": "led", "name": "l", "pin": "P1.15"}`;
    const circuit = parseJsonl(row, NRF, [AVR, ESP, NRF]).filter(isCircuitRow);
    expect(circuit).toHaveLength(1);
    expect(circuit[0].pin).toBe('P1.15');
  });

  it('accepts any target when the task declares none', () => {
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "led", "name": "l", "pin": 1}`, AVR))
      .not.toThrow();
  });
});

describe('parseJsonl (circuit pin forms)', () => {
  const row = (pin: string) => `{"target": "${NRF}", "part": "led", "name": "l", "pin": ${pin}}`;

  it('accepts integers, A0…A15, and nRF P<port>.<pin> names', () => {
    for (const pin of ['0', '53', '"A0"', '"A15"', '"P0.00"', '"P0.31"', '"P1.00"', '"P1.15"']) {
      expect(() => parseJsonl(row(pin), NRF), pin).not.toThrow();
    }
  });

  it('rejects an nRF pin past its port width', () => {
    expect(() => parseJsonl(row('"P1.16"'), NRF)).toThrow(/line 1: P1 has pins 00…15/);
    expect(() => parseJsonl(row('"P0.32"'), NRF)).toThrow(/line 1: P0 has pins 00…31/);
  });

  it('rejects malformed pins', () => {
    for (const pin of ['"P2.00"', '"P1.5"', '"p1.15"', '"A16"', '"D3"', '-1', '2.5', 'true', 'null']) {
      expect(() => parseJsonl(row(pin), NRF), pin).toThrow(/pin must be/);
    }
  });
});

describe('boot_offset_ms removal', () => {
  it('is rejected wherever it appears', () => {
    expect(() => parseJsonl('{"boot_offset_ms": 427}', AVR))
      .toThrow(/app start is detected automatically/);
  });
});

describe('parseJsonl (parse rows)', () => {
  it('reads a parse row', () => {
    const rows = parseJsonl('{"at": 900, "parse": "Distance: {d:d} cm"}', AVR);
    expect(rows).toEqual([{ at: 900, parse: 'Distance: {d:d} cm', as: undefined, from: undefined }]);
  });

  it('reads the optional `as` slot name', () => {
    const rows = parseJsonl('{"at": 900, "parse": "Button Pressed!", "as": "presses"}', AVR);
    expect(rows).toEqual([{ at: 900, parse: 'Button Pressed!', as: 'presses', from: undefined }]);
  });

  it('rejects an `as` that is not a slot name', () => {
    expect(() => parseJsonl('{"at": 9, "parse": "x", "as": "not a name"}', AVR))
      .toThrow(/'as' must be a slot name/);
  });

  it('reads the optional `from` address', () => {
    const rows = parseJsonl('{"at": 900, "parse": "Time: {t:d} ms", "from": "lcd.row0"}', AVR);
    expect(rows).toEqual([{ at: 900, parse: 'Time: {t:d} ms', as: undefined, from: 'lcd.row0' }]);
  });

  it('rejects a `from` that is not <role>.<prop>', () => {
    expect(() => parseJsonl('{"at": 9, "parse": "x{d:d}", "from": "lcd"}', AVR))
      .toThrow(/'from' must be '<role>\.<prop>'/);
    expect(() => parseJsonl('{"at": 9, "parse": "x{d:d}", "from": "lcd.row0.x"}', AVR))
      .toThrow(/'from' must be '<role>\.<prop>'/);
  });
});

describe('parseJsonl (pinless circuit rows)', () => {
  it('reads a circuit row without a pin', () => {
    const rows = parseJsonl(`{"target": "${ESP}", "part": "wifi", "name": "wifi"}`, ESP);
    expect(rows).toEqual([{ target: ESP, part: 'wifi', name: 'wifi' }]);
    expect(rows.filter(isCircuitRow)).toHaveLength(1);
  });

  it('still rejects a circuit row without a name', () => {
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "wifi"}`, ESP))
      .toThrow(/line 1: circuit row needs a "name"/);
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "led", "pin": 10}`, ESP))
      .toThrow(/line 1: circuit row needs a "name"/);
  });

  it('still requires a target', () => {
    expect(() => parseJsonl('{"part": "wifi", "name": "wifi"}', ESP))
      .toThrow(/circuit row needs a "target"/);
  });

  it('omits pin only for unwired parts', () => {
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "led", "name": "lamp"}`, ESP))
      .toThrow(/line 1: circuit row needs a "pin"/);
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "wifi", "name": "wifi", "pin": 10}`, ESP))
      .toThrow(/line 1: 'wifi' has no pins; drop "pin"/);
  });

  it('reads a ble row without a pin and rejects one with a pin', () => {
    expect(parseJsonl(`{"target": "${NRF}", "part": "ble", "name": "ble"}`, NRF))
      .toEqual([{ target: NRF, part: 'ble', name: 'ble' }]);
    expect(() => parseJsonl(`{"target": "${NRF}", "part": "ble", "name": "ble", "pin": "P0.13"}`, NRF))
      .toThrow(/line 1: 'ble' has no pins; drop "pin"/);
  });

  it('rejects keys a circuit row does not have, on any target', () => {
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "wifi", "name": "wifi", "at": 3000, "expect": "wifi.x == true"}`, ESP))
      .toThrow(/line 1: unknown circuit-row keys at, expect/);
    expect(() => parseJsonl(`{"target": "other", "part": "led", "name": "lamp", "pin": 10, "at": 5}`, ESP, [ESP, 'other']))
      .toThrow(/line 1: unknown circuit-row keys at/);
  });
});

describe('parseJsonl (peer rows)', () => {
  const peer = (fields: string) => `{"target": "${ESP}", ${fields}}`;
  const cloud = peer('"peer": "peer.py", "name": "cloud"');

  it('reads a peer row for the selected target', () => {
    const rows = parseJsonl(cloud, ESP, [ESP]);
    expect(rows).toEqual([{ target: ESP, peer: 'peer.py', name: 'cloud' }]);
    expect(rows.filter(isPeerRow)).toHaveLength(1);
    expect(rows.filter(isCircuitRow)).toHaveLength(0);
  });

  it('drops a peer row for another target', () => {
    expect(parseJsonl(cloud, AVR, [AVR, ESP])).toEqual([]);
  });

  it('rejects a peer row naming a target the task does not declare', () => {
    expect(() => parseJsonl(cloud, AVR, [AVR])).toThrow(/line 1: unknown target 'esp32s3_espidf'/);
  });

  it('rejects keys a peer row does not have', () => {
    expect(() => parseJsonl(peer('"peer": "peer.py", "name": "cloud", "at": 5'), ESP))
      .toThrow(/line 1: unknown peer-row keys at/);
    expect(() => parseJsonl(peer('"peer": "peer.py", "name": "cloud", "pin": 5'), ESP))
      .toThrow(/line 1: unknown peer-row keys pin/);
  });

  it('rejects a peer row missing a key', () => {
    expect(() => parseJsonl('{"peer": "peer.py", "name": "cloud"}', ESP))
      .toThrow(/line 1: peer row needs target/);
    expect(() => parseJsonl(peer('"peer": "peer.py"'), ESP))
      .toThrow(/line 1: peer row needs name/);
  });

  it('requires the peer file to be peer.py', () => {
    for (const file of ['"dir/peer.py"', '"../peer.py"', '"cloud_peer.py"', '"peer"', '42']) {
      expect(() => parseJsonl(peer(`"peer": ${file}, "name": "cloud"`), ESP), file)
        .toThrow(/line 1: "peer" must be "peer.py"/);
    }
  });

  it('requires the role name to be an identifier', () => {
    for (const name of ['"my cloud"', '"1cloud"', '"cloud.x"', '""', '7']) {
      expect(() => parseJsonl(peer(`"peer": "peer.py", "name": ${name}`), ESP), name)
        .toThrow(/line 1: peer "name" must be an identifier/);
    }
  });

  it('rejects a reserved role name', () => {
    for (const name of ['pin', 'serial', 'true', 'false', 'and']) {
      expect(() => parseJsonl(peer(`"peer": "peer.py", "name": "${name}"`), ESP), name)
        .toThrow(new RegExp(`line 1: '${name}' is a reserved name`));
    }
  });

  it('allows one peer row per target, on any target', () => {
    const second = peer('"peer": "peer.py", "name": "backend"');
    expect(() => parseJsonl([cloud, second].join('\n'), ESP))
      .toThrow(/line 2: a second peer row for target 'esp32s3_espidf'/);
    expect(() => parseJsonl([cloud, second].join('\n'), AVR, [AVR, ESP]))
      .toThrow(/line 2: a second peer row for target 'esp32s3_espidf'/);
  });

  it('accepts one peer row each for two targets', () => {
    const other = `{"target": "${NRF}", "peer": "peer.py", "name": "cloud"}`;
    const rows = parseJsonl([cloud, other].join('\n'), NRF, [ESP, NRF]);
    expect(rows).toEqual([{ target: NRF, peer: 'peer.py', name: 'cloud' }]);
  });
});

describe('parseJsonl (reserved role names)', () => {
  it('rejects a circuit row named after a reserved word', () => {
    expect(() => parseJsonl(`{"target": "${ESP}", "part": "led", "name": "serial", "pin": 10}`, ESP))
      .toThrow(/line 1: 'serial' is a reserved name/);
  });
});

describe('parseJsonl (event row keys)', () => {
  it('rejects extra keys and a second event kind', () => {
    expect(() => parseJsonl('{"at": 5, "expect": "a.b == 1", "note": "x"}', ESP))
      .toThrow(/line 1: unknown keys note on a expect row/);
    expect(() => parseJsonl('{"at": 5, "expect": "a.b == 1", "do": "c.d"}', ESP))
      .toThrow(/line 1: one row carries one of expect\/set\/do\/capture\/parse\/send, got expect, do/);
    expect(() => parseJsonl('{"at": 5, "parse": "x {v:d}", "from": "a.b", "as": "y"}', ESP)).not.toThrow();
  });
});
