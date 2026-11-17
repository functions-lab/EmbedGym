import { describe, it, expect } from 'vitest';
import { parseCapture, parseJsonl } from '../jsonl_spec';

describe('parseCapture', () => {
  it('parses <name> = <role>.<prop>', () => {
    expect(parseCapture('b1 = led.brightness'))
      .toEqual({ name: 'b1', role: 'led', prop: 'brightness' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCapture('   r1   =   buzzer.pulseRate   '))
      .toEqual({ name: 'r1', role: 'buzzer', prop: 'pulseRate' });
  });

  it('rejects a missing prop', () => {
    expect(() => parseCapture('b1 = led')).toThrow(/unsupported capture/);
  });

  it('rejects a literal on the right-hand side', () => {
    expect(() => parseCapture('b1 = 5')).toThrow(/unsupported capture/);
  });

  it('rejects a name that is not an identifier', () => {
    expect(() => parseCapture('2b = led.brightness')).toThrow(/unsupported capture/);
  });
});

describe('parseJsonl (capture rows)', () => {
  it('accepts a capture row', () => {
    expect(parseJsonl('{"at": 500, "capture": "b1 = led.brightness"}', 'atmega2560_arduino'))
      .toEqual([{ at: 500, capture: 'b1 = led.brightness' }]);
  });
});
