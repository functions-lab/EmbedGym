import { describe, it, expect } from 'vitest';
import { parseExpect, evaluatePropComparison, captureValue } from '../jsonl_spec';

type PropCmp = Extract<ReturnType<typeof parseExpect>, { kind: 'prop' }>;
const cmp = (expr: string) => parseExpect(expr) as PropCmp;
const noCaptures = new Map<string, number>();

describe('evaluatePropComparison (== op)', () => {
  it('matches equal booleans and rejects unequal ones', () => {
    expect(evaluatePropComparison(cmp('led.value == true'), true, noCaptures).ok).toBe(true);
    expect(evaluatePropComparison(cmp('led.value == true'), false, noCaptures).ok).toBe(false);
  });

  it('compares strings exactly, padding included', () => {
    expect(evaluatePropComparison(cmp("lcd.row0 == 'hi'"), 'hi', noCaptures).ok).toBe(true);
    expect(evaluatePropComparison(cmp("lcd.row0 == 'hi'"), 'hi ', noCaptures).ok).toBe(false);
    expect(evaluatePropComparison(cmp("lcd.row0 == ''"), '', noCaptures).ok).toBe(true);
  });

  it('uses strict equality (no coercion)', () => {
    expect(evaluatePropComparison(cmp('buzzer.frequency == 1000'), '1000', noCaptures).ok).toBe(false);
    expect(evaluatePropComparison(cmp('led.value == false'), undefined, noCaptures).ok).toBe(false);
  });

  it('resolves a @ref and reports it in refDesc', () => {
    const captures = new Map([['b1', 0.5]]);
    const r = evaluatePropComparison(cmp('led.brightness == @b1'), 0.5, captures);
    expect(r.ok).toBe(true);
    expect(r.refDesc).toBe(' [@b1 = 0.5]');
  });
});

describe('evaluatePropComparison (inequalities)', () => {
  const captures = new Map([['b1', 0.5]]);

  it('evaluates < <= > >= including boundaries', () => {
    expect(evaluatePropComparison(cmp('led.brightness < 0.5'), 0.4, noCaptures).ok).toBe(true);
    expect(evaluatePropComparison(cmp('led.brightness < 0.5'), 0.5, noCaptures).ok).toBe(false);
    expect(evaluatePropComparison(cmp('led.brightness <= 0.5'), 0.5, noCaptures).ok).toBe(true);
    expect(evaluatePropComparison(cmp('led.brightness > 0.5'), 0.5, noCaptures).ok).toBe(false);
    expect(evaluatePropComparison(cmp('led.brightness > 0.5'), 0.6, noCaptures).ok).toBe(true);
    expect(evaluatePropComparison(cmp('led.brightness >= 0.5'), 0.5, noCaptures).ok).toBe(true);
  });

  it('compares against a resolved @ref', () => {
    expect(evaluatePropComparison(cmp('led.brightness > @b1'), 0.9, captures).ok).toBe(true);
    expect(evaluatePropComparison(cmp('led.brightness > @b1'), 0.1, captures).ok).toBe(false);
  });

  it('throws when the @ref was never captured', () => {
    expect(() => evaluatePropComparison(cmp('led.brightness > @nope'), 0.9, noCaptures))
      .toThrow(/'@nope' was never taken/);
  });

  it('throws when the sampled value is not a number', () => {
    expect(() => evaluatePropComparison(cmp('led.value > 0.5'), true, noCaptures))
      .toThrow(/needs numbers/);
    expect(() => evaluatePropComparison(cmp('led.missing > 0.5'), undefined, noCaptures))
      .toThrow(/needs numbers/);
  });
});

describe('captureValue', () => {
  const act = { name: 'b1', role: 'led', prop: 'brightness' };

  it('passes numbers through', () => {
    expect(captureValue(act, 0.75)).toBe(0.75);
    expect(captureValue(act, 0)).toBe(0);
  });

  it('throws on non-numeric samples', () => {
    expect(() => captureValue(act, true)).toThrow(/needs a numeric prop/);
    expect(() => captureValue(act, undefined)).toThrow(/needs a numeric prop/);
    expect(() => captureValue(act, 'bright')).toThrow(/needs a numeric prop/);
  });
});
