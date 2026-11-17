import { describe, it, expect } from 'vitest';
import { rowPropIndex, deriveRowProp } from '../jsonl_spec';

// A 16×2 buffer as the LCD element exposes it: row 0 then row 1, space-padded.
const pad = (s: string, n = 16) => s.padEnd(n, ' ');
const lcd = (row0: string, row1: string) => pad(row0) + pad(row1);

describe('rowPropIndex', () => {
  it('reads row<N>', () => {
    expect(rowPropIndex('row0')).toBe(0);
    expect(rowPropIndex('row1')).toBe(1);
    expect(rowPropIndex('row3')).toBe(3);
  });

  it('is null for anything else', () => {
    expect(rowPropIndex('text')).toBeNull();
    expect(rowPropIndex('rows')).toBeNull();
    expect(rowPropIndex('row')).toBeNull();
    expect(rowPropIndex('row05')).toBeNull();
  });
});

describe('deriveRowProp', () => {
  const derive = (text: string, row: number, cols = 16, rows = 2) =>
    deriveRowProp('lcd.row' + row, text, cols, rows, row);

  it('slices each row by the column count', () => {
    const text = lcd('Ax(g): 0.50', 'Gx(dps): 100.00');
    expect(derive(text, 0)).toBe('Ax(g): 0.50');
    expect(derive(text, 1)).toBe('Gx(dps): 100.00');
  });

  it('keeps interior spaces and trims only the trailing padding', () => {
    expect(derive(lcd('A  B', ''), 0)).toBe('A  B');
  });

  it('returns an empty string for an all-space row', () => {
    expect(derive(lcd('Timing...', ''), 1)).toBe('');
  });

  it('trims the NULs the element boots with', () => {
    expect(derive('\0'.repeat(32), 0)).toBe('');
    expect(derive('Hi' + '\0'.repeat(30), 0)).toBe('Hi');
  });

  it('handles a 20x4 display', () => {
    const text = 'row zero'.padEnd(20) + 'one'.padEnd(20) + 'two'.padEnd(20) + 'three'.padEnd(20);
    expect(deriveRowProp('lcd.row3', text, 20, 4, 3)).toBe('three');
  });

  it('raises for a row past the display', () => {
    expect(() => derive(lcd('a', 'b'), 2)).toThrow(/display has 2 rows/);
  });

  it('raises when the element has no text or column count', () => {
    expect(() => deriveRowProp('led.row0', undefined, 16, 2, 0)).toThrow(/no text\/numCols/);
    expect(() => deriveRowProp('led.row0', 42, 16, 2, 0)).toThrow(/no text\/numCols/);
    expect(() => deriveRowProp('led.row0', 'hi', undefined, 2, 0)).toThrow(/no text\/numCols/);
    expect(() => deriveRowProp('led.row0', 'hi', 16, undefined, 0)).toThrow(/no text\/numCols/);
  });
});
