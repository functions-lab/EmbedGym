import { describe, it, expect } from 'vitest';
import { parseDo } from '../jsonl_spec';

describe('parseDo', () => {
  it('parses <role>.<verb> for any identifier verb (runner validates per element)', () => {
    expect(parseDo('button.down')).toEqual({ role: 'button', verb: 'down' });
    expect(parseDo('button.up')).toEqual({ role: 'button', verb: 'up' });
    expect(parseDo('enc.clockwiseStep')).toEqual({ role: 'enc', verb: 'clockwiseStep' });
    expect(parseDo('enc.press')).toEqual({ role: 'enc', verb: 'press' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDo('   button.down   ')).toEqual({ role: 'button', verb: 'down' });
  });

  it('rejects an address without a verb', () => {
    expect(() => parseDo('button')).toThrow(/unsupported do/);
  });

  it('rejects a non-identifier verb', () => {
    expect(() => parseDo('button.ho-ld')).toThrow(/unsupported do/);
  });

  it('parses a keyed cell <role>.<key>.down', () => {
    expect(parseDo('keypad.5.down')).toEqual({ role: 'keypad', key: '5', verb: 'down' });
    expect(parseDo('keypad.5.up')).toEqual({ role: 'keypad', key: '5', verb: 'up' });
  });

  it('accepts non-alphanumeric key labels', () => {
    expect(parseDo('keypad.#.down')).toEqual({ role: 'keypad', key: '#', verb: 'down' });
    expect(parseDo('keypad.*.up')).toEqual({ role: 'keypad', key: '*', verb: 'up' });
    expect(parseDo('keypad.A.down')).toEqual({ role: 'keypad', key: 'A', verb: 'down' });
  });

  it('accepts a keyed cell with any identifier verb', () => {
    expect(parseDo('keypad.5.hold')).toEqual({ role: 'keypad', key: '5', verb: 'hold' });
  });
});
