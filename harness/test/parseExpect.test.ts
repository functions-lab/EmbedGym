import { describe, it, expect } from 'vitest';
import { parseExpect } from '../jsonl_spec';

describe('parseExpect (prop form)', () => {
  it('parses <role>.<prop> == <bool>', () => {
    expect(parseExpect('led_red.value == true'))
      .toEqual({ kind: 'prop', role: 'led_red', prop: 'value', op: '==', value: true });
  });

  it('parses <role>.<prop> == <number>', () => {
    expect(parseExpect('buzzer.frequency == 1000'))
      .toEqual({ kind: 'prop', role: 'buzzer', prop: 'frequency', op: '==', value: 1000 });
  });

  it('parses <role> == <literal> (no prop)', () => {
    expect(parseExpect('led == false'))
      .toEqual({ kind: 'prop', role: 'led', prop: null, op: '==', value: false });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseExpect('   buzzer.hasSignal   ==   true   '))
      .toEqual({ kind: 'prop', role: 'buzzer', prop: 'hasSignal', op: '==', value: true });
  });

  it('rejects `!=`', () => {
    expect(() => parseExpect('led.value != true')).toThrow(/unsupported expect/);
  });

  it('rejects `pin.<N>` addresses (deferred)', () => {
    expect(() => parseExpect('pin.3 == true')).toThrow(/unsupported expect/);
  });

  it('rejects non-JSON literals', () => {
    expect(() => parseExpect('led.value == yes')).toThrow(/not valid JSON/);
  });
});

describe('parseExpect (inequalities + capture refs)', () => {
  it('parses <role>.<prop> < <number>', () => {
    expect(parseExpect('temp.temperature < 30'))
      .toEqual({ kind: 'prop', role: 'temp', prop: 'temperature', op: '<', value: 30 });
  });

  it('parses <= and >= before < and >', () => {
    expect(parseExpect('led.brightness <= 0.5'))
      .toEqual({ kind: 'prop', role: 'led', prop: 'brightness', op: '<=', value: 0.5 });
    expect(parseExpect('led.brightness >= 0.5'))
      .toEqual({ kind: 'prop', role: 'led', prop: 'brightness', op: '>=', value: 0.5 });
  });

  it('parses a @name capture reference as the value', () => {
    expect(parseExpect('led.brightness > @b1'))
      .toEqual({ kind: 'prop', role: 'led', prop: 'brightness', op: '>', value: { ref: 'b1' } });
  });

  it('accepts @name with ==', () => {
    expect(parseExpect('buzzer.pulseRate == @r1'))
      .toEqual({ kind: 'prop', role: 'buzzer', prop: 'pulseRate', op: '==', value: { ref: 'r1' } });
  });

  it('rejects an inequality against a non-number literal', () => {
    expect(() => parseExpect("led.brightness > 'hi'")).toThrow(/compares numbers only/);
    expect(() => parseExpect('led.brightness > true')).toThrow(/compares numbers only/);
  });

  it('rejects a malformed @reference', () => {
    expect(() => parseExpect('led.brightness > @2b')).toThrow(/not valid JSON/);
  });
});

describe('parseExpect (serial is not an address)', () => {
  it('rejects the removed `serial contains` form', () => {
    expect(() => parseExpect("serial contains 'Button Pressed!'"))
      .toThrow(/not an expect address/);
  });

  it('rejects any other verb on `serial`', () => {
    expect(() => parseExpect("serial matches 'hi'")).toThrow(/not an expect address/);
    expect(() => parseExpect("serial == 'hi'")).toThrow(/not an expect address/);
  });

  it('still allows a role whose name merely starts with serial', () => {
    expect(parseExpect('serial_led.value == true'))
      .toEqual({ kind: 'prop', role: 'serial_led', prop: 'value', op: '==', value: true });
  });
});

describe('parseExpect (prop contains form)', () => {
  it('parses <role>.<prop> contains <string>', () => {
    expect(parseExpect("lcd.text contains 'Hello World'"))
      .toEqual({ kind: 'prop-contains', role: 'lcd', prop: 'text', substring: 'Hello World' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseExpect("   lcd.text   contains   'hi'   "))
      .toEqual({ kind: 'prop-contains', role: 'lcd', prop: 'text', substring: 'hi' });
  });

  it('requires a prop (contains without a prop is not a serial expression)', () => {
    expect(() => parseExpect("lcd contains 'hi'")).toThrow(/unsupported expect/);
  });

  it('rejects double-quoted strings', () => {
    expect(() => parseExpect('lcd.text contains "hi"')).toThrow(/unsupported expect/);
  });
});

describe('parseExpect (string values and row props)', () => {
  it('parses a single-quoted string value', () => {
    expect(parseExpect("lcd.row0 == 'Input: 1234'"))
      .toEqual({ kind: 'prop', role: 'lcd', prop: 'row0', op: '==', value: 'Input: 1234' });
  });

  it('parses the empty string (a blank row)', () => {
    expect(parseExpect("lcd.row1 == ''"))
      .toEqual({ kind: 'prop', role: 'lcd', prop: 'row1', op: '==', value: '' });
  });

  it('accepts a row prop with contains', () => {
    expect(parseExpect("lcd.row1 contains 'Status'"))
      .toEqual({ kind: 'prop-contains', role: 'lcd', prop: 'row1', substring: 'Status' });
  });

  it('still rejects a string on an inequality', () => {
    expect(() => parseExpect("lcd.row0 < 'abc'")).toThrow(/compares numbers only/);
  });

  it('leaves an unquoted word a load error', () => {
    expect(() => parseExpect('lcd.row0 == Input')).toThrow(/not valid JSON/);
  });
});

describe('parseExpect (slot expression form)', () => {
  it('parses an expression that starts with a slot', () => {
    expect(parseExpect('@dist[-1] == 10'))
      .toEqual({ kind: 'slot-expr', expr: '@dist[-1] == 10' });
  });

  it('parses an expression that mentions a slot later on', () => {
    expect(parseExpect('len(@presses) == 3'))
      .toEqual({ kind: 'slot-expr', expr: 'len(@presses) == 3' });
    expect(parseExpect('800 < @p.t[-1] && @p.t[-1] <= 900'))
      .toEqual({ kind: 'slot-expr', expr: '800 < @p.t[-1] && @p.t[-1] <= 900' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseExpect('   @n[-1] > 0   '))
      .toEqual({ kind: 'slot-expr', expr: '@n[-1] > 0' });
  });

  it('leaves the legacy prop form alone when @name is the right-hand side', () => {
    expect(parseExpect('led.brightness < @b1'))
      .toEqual({ kind: 'prop', role: 'led', prop: 'brightness', op: '<', value: { ref: 'b1' } });
  });

  it('still rejects an expression with no slot and no legacy form', () => {
    expect(() => parseExpect('len(presses) == 3')).toThrow(/unsupported expect/);
  });
});
