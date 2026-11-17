import { describe, it, expect } from 'vitest';
import {
  compileSlotExpr,
  evaluateSlotExpr,
  extractSlotNames,
} from '../serial_spec';

function slotList(values: Array<number | string>, times: number[]) {
  const list = [...values] as Array<number | string> & { t: number[] };
  Object.defineProperty(list, 't', { value: times, enumerable: false });
  return list;
}

const slots = {
  dist: slotList([10, 40, 100], [100, 500, 900]),
  keys: slotList(['5', 'A'], [200, 700]),
  b1: 42,
};

const evaluate = (expr: string, scope: Record<string, unknown> = slots) =>
  evaluateSlotExpr(compileSlotExpr(expr), scope);

describe('slot expressions', () => {
  it('indexes from the end', () => {
    expect(evaluate('@dist[-1] == 100')).toBe(true);
    expect(evaluate('@dist[-2] < @dist[-1]')).toBe(true);
    expect(evaluate('@dist[-3] == 10')).toBe(true);
  });

  it('indexes from the front too', () => {
    expect(evaluate('@dist[0] == 10')).toBe(true);
  });

  it('reads print times through `.t`', () => {
    expect(evaluate('@dist.t[-1] == 900')).toBe(true);
    expect(evaluate('@dist.t[-1] - @dist.t[-2] > 100')).toBe(true);
    expect(evaluate('500 < @dist.t[-1] && @dist.t[-1] <= 900')).toBe(true);
  });

  it('counts with len() or .length', () => {
    expect(evaluate('len(@dist) == 3')).toBe(true);
    expect(evaluate('@dist.length == 3')).toBe(true);
    expect(evaluate('len(@keys) == 2')).toBe(true);
  });

  it('compares strings', () => {
    expect(evaluate("@keys[-1] == 'A'")).toBe(true);
    expect(evaluate("@keys[-1] === 'A'")).toBe(true);
    expect(evaluate("@keys[-1] == '5'")).toBe(false);
  });

  it('reads scalar capture slots', () => {
    expect(evaluate('@b1 == 42')).toBe(true);
  });

  it('leaves quoted text untouched', () => {
    expect(evaluate("@keys[-1] == 'A' && 'a@b[-1]' == 'a@b[-1]'")).toBe(true);
  });

  it('fails the check when an index is out of range', () => {
    expect(evaluate('@keys[-5] == 3')).toBe(false);
    expect(evaluate('@keys.t[-5] > 0')).toBe(false);
  });

  it('rejects a non-boolean result', () => {
    expect(() => evaluate('@dist[-1]')).toThrow(/true\/false/);
  });

  it('rejects chained comparisons', () => {
    expect(() => compileSlotExpr('500 < @dist.t[-1] <= 900')).toThrow(/chained comparison/);
  });

  it('rejects a syntax error at compile time', () => {
    expect(() => compileSlotExpr('@dist[-1] ==')).toThrow(/invalid expect expression/);
  });

  it('rejects a bare `@`', () => {
    expect(() => compileSlotExpr('@ == 1')).toThrow(/slot name/);
  });

  it('lists the slots an expression reads', () => {
    expect(extractSlotNames('@dist[-1] > @keys.length && @b1 == 42').sort())
      .toEqual(['b1', 'dist', 'keys']);
  });
});

describe('unbound slots at evaluation time', () => {
  it('names the slot instead of throwing a cryptic TypeError', () => {
    const fn = compileSlotExpr('@dist[-1] == 10');
    expect(() => evaluateSlotExpr(fn, {}, ['dist'])).toThrow(/slot '@dist' was never bound/);
  });

  it('accepts a slot that is bound but empty', () => {
    const fn = compileSlotExpr('len(@dist) == 0');
    expect(evaluateSlotExpr(fn, { dist: slotList([], []) }, ['dist'])).toBe(true);
  });
});

describe('rewriter edge cases', () => {
  const tricky = {
    k: slotList(['a@b', 'x[-1]'], [10, 20]),
    n: slotList([1, 2, 3], [1, 2, 3]),
  };

  it('leaves @ and [-1] inside quotes alone', () => {
    expect(evaluate("@k[-2] == 'a@b'", tricky)).toBe(true);
    expect(evaluate("@k[-1] == 'x[-1]'", tricky)).toBe(true);
    expect(evaluate('@k[-2] == "a@b"', tricky)).toBe(true);
  });

  it('leaves positive indexing and property reads alone', () => {
    expect(evaluate('@n[0] == 1', tricky)).toBe(true);
    expect(evaluate('@n.length - 1 == 2', tricky)).toBe(true);
  });

  it('does not confuse subtraction with a negative index', () => {
    expect(evaluate('@n[-1] - 1 == 2', tricky)).toBe(true);
  });

  it('rejects an unterminated string', () => {
    expect(() => compileSlotExpr("@k[-1] == 'oops")).toThrow(/unterminated string/);
  });
});


describe('extractSlotNames', () => {
  it('reports the slot, not the .t suffix', () => {
    expect(extractSlotNames('@dist.t[-1] - @dist.t[-2] > 100')).toEqual(['dist']);
  });

  it('deduplicates repeated reads', () => {
    expect(extractSlotNames('@n[-1] > @n[-2] && len(@n) == 3')).toEqual(['n']);
  });

  it('ignores an @ inside a quoted string', () => {
    expect(extractSlotNames("@k[-1] == 'user@example.com'")).toEqual(['k']);
  });

  it('returns nothing for an expression with no slots', () => {
    expect(extractSlotNames('1 == 1')).toEqual([]);
  });
});

describe('compileSlotExpr names', () => {
  it('rejects bare names other than len, Math, true and false', () => {
    expect(() => compileSlotExpr("@n == 0 || cloud.nope == 1")).toThrow(/unknown name 'cloud'/);
    expect(() => compileSlotExpr('window.x == 1')).toThrow(/unknown name 'window'/);
    expect(() => compileSlotExpr('Math.abs(@a[-1] - 3) < 1 && len(@a) > 0 && true')).not.toThrow();
    expect(() => compileSlotExpr("@s[0] == 'cloud.nope' && @x.t[0] > 1e3")).not.toThrow();
  });
});
