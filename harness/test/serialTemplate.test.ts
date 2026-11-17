import { describe, it, expect } from 'vitest';
import { compileTemplate, matchLine } from '../serial_spec';

const match = (template: string, line: string) => matchLine(compileTemplate(template), line);

describe('compileTemplate placeholders', () => {
  it('matches {d} with an optional sign', () => {
    expect(match('Position: {p:d}', 'Position: 3')).toEqual([3]);
    expect(match('Position: {p:d}', 'Position: -1')).toEqual([-1]);
    expect(match('Position: {p:d}', 'Position: 3.5')).toBeNull();
  });

  it('matches {f} with or without a fraction', () => {
    expect(match('T: {t:f}', 'T: 34.07')).toEqual([34.07]);
    expect(match('T: {t:f}', 'T: 34')).toEqual([34]);
    expect(match('T: {t:f}', 'T: -0.5')).toEqual([-0.5]);
  });

  it('{f.N} demands exactly N fractional digits', () => {
    expect(match('H: {h:f.1} %', 'H: 64.0 %')).toEqual([64]);
    expect(match('H: {h:f.1} %', 'H: 64.00 %')).toBeNull();
    expect(match('H: {h:f.1} %', 'H: 64 %')).toBeNull();
  });

  it('matches {s} as a non-space token', () => {
    expect(match('Key Pressed: {k:s}', 'Key Pressed: #')).toEqual(['#']);
    expect(match('Key Pressed: {k:s}', 'Key Pressed: A B')).toBeNull();
  });

  it('binds several placeholders in order', () => {
    expect(match('T: {t:d} C, H: {h:d} %', 'T: 34 C, H: 71 %')).toEqual([34, 71]);
  });

  it('keeps unnamed placeholders out of the field list', () => {
    const tpl = compileTemplate('aX: {d} aZ: {az:d}');
    expect(tpl.fields).toEqual([{ name: 'az', type: 'd' }]);
    expect(matchLine(tpl, 'aX: 0 aZ: 16384')).toEqual([16384]);
  });
});

describe('compileTemplate literals', () => {
  it('treats regex metacharacters as literal text', () => {
    expect(match('H: {h:d} % (ok)', 'H: 71 % (ok)')).toEqual([71]);
    expect(match('a.c', 'abc')).toBeNull();
    expect(match('a.c', 'a.c')).toEqual([]);
  });

  it('anchors to the whole line', () => {
    const motion = compileTemplate('Motion Detected!');
    expect(matchLine(motion, 'Motion Detected!')).toEqual([]);
    expect(matchLine(motion, 'No Motion Detected!')).toBeNull();
    expect(match('Distance: {d:d} cm', 'log Distance: 10 cm')).toBeNull();
    expect(match('Distance: {d:d} cm', 'Distance: 10 cm!')).toBeNull();
  });
});

describe('compileTemplate errors', () => {
  it('rejects an empty template', () => {
    expect(() => compileTemplate('')).toThrow(/empty/);
  });

  it('rejects malformed placeholders', () => {
    expect(() => compileTemplate('x {q}')).toThrow(/malformed placeholder/);
    expect(() => compileTemplate('x {f.}')).toThrow(/malformed placeholder/);
    expect(() => compileTemplate('x {name:}')).toThrow(/malformed placeholder/);
    expect(() => compileTemplate('x {d')).toThrow(/malformed placeholder/);
  });

  it('rejects a repeated placeholder name', () => {
    expect(() => compileTemplate('{a:d} and {a:d}')).toThrow(/duplicate placeholder name/);
  });
});

describe('compileTemplate zero padding', () => {
  it('accepts padded and unpadded integers alike', () => {
    expect(match('{y:d}/{mo:d}/{d:d}', '2026/02/02')).toEqual([2026, 2, 2]);
    expect(match('{y:d}/{mo:d}/{d:d}', '2026/2/2')).toEqual([2026, 2, 2]);
  });

  it('rejects a width suffix on {d}', () => {
    expect(() => compileTemplate('{y:d.4}')).toThrow(/malformed placeholder/);
  });
});
