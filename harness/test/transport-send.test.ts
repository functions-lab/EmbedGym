import { describe, it, expect } from 'vitest';
import { buildTimeline, parseJsonl, parseExpect, parseSend } from '../jsonl_spec';
import { SerialLineStore, SerialByteStore } from '../serial_spec';

const target = 'atmega2560_arduino';
const role = (name: string) => { if (name !== 'radio') throw new Error(`unknown role '${name}'`); return 'module'; };
const build = (event: object, selected = target, part = 'hm10') => buildTimeline(parseJsonl([
  JSON.stringify({ target: selected, part, name: 'radio', pin: 19 }), JSON.stringify(event),
].join('\n'), selected), role);

describe('raw byte transport rows', () => {
  it('keeps exact bytes and stable same-time drive ordering', () => {
    const rows = parseJsonl([
      JSON.stringify({ at: 100, send: 'serial', bytes: [0, 13, 10, 255] }),
      JSON.stringify({ at: 100, send: 'serial', bytes: [65] }),
      JSON.stringify({ at: 100, expect: "serial.txHex == ''" }),
    ].join('\n'), target);
    const timeline = buildTimeline(rows, role);
    expect(timeline.events.map((event) => event.kind)).toEqual(['send', 'send', 'expect']);
    expect(parseSend(rows[0] as any)).toEqual({ endpoint: 'serial', bytes: [0, 13, 10, 255] });
  });
  it('requires an HM-10 component role for remote writes', () => {
    expect(build({ at: 1, send: 'radio.remote', bytes: [49] }).events[0].kind).toBe('send');
    expect(() => build({ at: 1, send: 'radio.remote', bytes: [49] }, target, 'led')).toThrow(/HM-10 role/);
    expect(() => build({ at: 1, send: 'other.remote', bytes: [49] })).toThrow(/unknown role/);
  });
  for (const bytes of [[], [256], [-1], [0.1], ['65'], [null], 'abc', undefined]) {
    it(`rejects malformed payload ${JSON.stringify(bytes)}`, () => {
      expect(() => build({ at: 1, send: 'serial', bytes })).toThrow(/bytes/);
    });
  }
  for (const at of [-1, '100', null, undefined]) {
    it(`rejects invalid send time ${JSON.stringify(at)}`, () => {
      expect(() => build({ at, send: 'serial', bytes: [65] })).toThrow(/finite nonnegative/);
    });
  }
  for (const send of ['serial.remote', 'radio.remote.key', 'radio', 'radio.tx', ' radio.remote ', 1]) {
    it(`rejects invalid endpoint ${JSON.stringify(send)}`, () => {
      expect(() => build({ at: 1, send, bytes: [65] })).toThrow(/endpoint/);
    });
  }
  it('rejects extra keys and mixed event kinds', () => {
    expect(() => build({ at: 1, send: 'serial', bytes: [65], target })).toThrow(/only circuit and peer/);
    expect(() => build({ at: 1, send: 'serial', bytes: [65], do: 'radio.connect' })).toThrow(/one row carries one/);
    expect(() => build({ at: 1, send: 'serial', bytes: [65], foo: true })).toThrow(/unknown keys/);
  });
  for (const selected of ['atmega328p_arduino', 'esp32s3_espidf', 'esp32s3_arduino', 'nrf52840_zephyr', 'nrf52840_arduino']) {
    it(`admits console send, txHex and remote send on ${selected}`, () => {
      const timeline = buildTimeline(parseJsonl([
        JSON.stringify({ target: selected, part: 'hm10', name: 'radio', pin: 19 }),
        JSON.stringify({ at: 1, send: 'serial', bytes: [0, 13, 10, 255] }),
        JSON.stringify({ at: 2, expect: "serial.txHex contains '000d0aff'" }),
        JSON.stringify({ at: 3, send: 'radio.remote', bytes: [49] }),
      ].join('\n'), selected), role);
      expect(timeline.events.map((event) => event.kind)).toEqual(['send', 'expect', 'send']);
    });
  }
  it('admits only raw console expect observations', () => {
    expect(build({ at: 1, expect: "serial.txHex contains '00'" }).events).toHaveLength(1);
    for (const expression of ['serial == true', 'serial.other == 1', 'serial.txHex > 0', 'serial.txHex == @capture']) {
      expect(() => parseExpect(expression)).toThrow(/serial/);
    }
    expect(() => build({ at: 1, capture: 'raw = serial.txHex' })).toThrow(/serial.txHex expect/);
    expect(() => build({ at: 1, parse: '{raw:s}', from: 'serial.txHex' })).toThrow(/serial.txHex expect/);
  });
});

describe('raw console observations', () => {
  it('keeps all bytes, partial lines and timestamps without clearing', () => {
    const store = new SerialByteStore();
    const lines = new SerialLineStore();
    [[66, -1], [0, 0], [13, 1], [10, 2], [255, 3], [65, 5]].forEach(([byte, time]) => { store.pushByte(byte, time); lines.pushByte(byte, time); });
    expect(store.hexAsOf(2)).toBe('000d0a');
    expect(store.hexAsOf(5)).toBe('000d0aff41');
    expect(store.hexAsOf(2)).toBe('000d0a');
    expect(lines.linesAsOf(5)).toEqual([{ text: 'B\0', t: 2 }]);
    expect(lines.pending).toBe('\xffA');
  });
  it('rejects invalid byte/timestamp ingress', () => {
    const store = new SerialByteStore();
    expect(() => store.pushByte(256, 0)).toThrow(/serial byte/);
    expect(() => store.pushByte(1, NaN)).toThrow(/serial byte/);
  });
});
