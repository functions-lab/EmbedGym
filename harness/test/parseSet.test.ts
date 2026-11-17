import { describe, it, expect } from 'vitest';
import { parseSet } from '../jsonl_spec';

describe('parseSet', () => {
  it('parses a numeric literal', () => {
    expect(parseSet('temp.temperature = 30'))
      .toEqual({ role: 'temp', prop: 'temperature', value: 30 });
  });

  it('parses a float literal', () => {
    expect(parseSet('bmp.pressure = 1013.25'))
      .toEqual({ role: 'bmp', prop: 'pressure', value: 1013.25 });
  });

  it('parses a boolean literal', () => {
    expect(parseSet('tilt.toggle = true'))
      .toEqual({ role: 'tilt', prop: 'toggle', value: true });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseSet('   pot.value   =   512   '))
      .toEqual({ role: 'pot', prop: 'value', value: 512 });
  });

  it('rejects an address without a prop', () => {
    expect(() => parseSet('temp = 30')).toThrow(/unsupported set/);
  });

  it('rejects non-JSON literals', () => {
    expect(() => parseSet('temp.temperature = warm')).toThrow(/not valid JSON/);
  });
});
