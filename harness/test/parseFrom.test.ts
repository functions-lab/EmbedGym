import { describe, it, expect } from 'vitest';
import { compileTemplate, appendParseSample } from '../serial_spec';

const tpl = compileTemplate('Time: {ms:d} ms');

describe('appendParseSample', () => {
  it('appends the parsed value stamped with the sample time', () => {
    const slots: Record<string, unknown> = {};
    appendParseSample(tpl, undefined, 'Time: 850 ms', 2400, slots);
    const ms = slots.ms as (number | string)[] & { t: number[] };
    expect([...ms]).toEqual([850]);
    expect(ms.t).toEqual([2400]);
  });

  it('accumulates across calls rather than replacing', () => {
    const slots: Record<string, unknown> = {};
    appendParseSample(tpl, undefined, 'Time: 850 ms', 2400, slots);
    appendParseSample(tpl, undefined, 'Time: 1250 ms', 4600, slots);
    const ms = slots.ms as (number | string)[] & { t: number[] };
    expect([...ms]).toEqual([850, 1250]);
    expect(ms.t).toEqual([2400, 4600]);
  });

  it('binds an empty slot when nothing matches', () => {
    const slots: Record<string, unknown> = {};
    appendParseSample(tpl, undefined, 'Timing...', 1500, slots);
    expect('ms' in slots).toBe(true);
    expect(slots.ms).toHaveLength(0);
  });

  it('leaves an earlier value alone when a later sample does not match', () => {
    const slots: Record<string, unknown> = {};
    appendParseSample(tpl, undefined, 'Time: 850 ms', 2400, slots);
    appendParseSample(tpl, undefined, 'Timing...', 3300, slots);
    expect([...(slots.ms as number[])]).toEqual([850]);
  });

  it('binds the whole sample under `as`', () => {
    const literal = compileTemplate('Status: Success');
    const slots: Record<string, unknown> = {};
    appendParseSample(literal, 'ok', 'Status: Success', 4000, slots);
    const ok = slots.ok as (number | string)[] & { t: number[] };
    expect([...ok]).toEqual(['Status: Success']);
    expect(ok.t).toEqual([4000]);
  });

  it('anchors on the whole sample, not a substring', () => {
    const slots: Record<string, unknown> = {};
    appendParseSample(tpl, undefined, 'Time: 850 ms left', 2400, slots);
    expect(slots.ms).toHaveLength(0);
  });

  it('enforces the fraction-digit count of {f.N}', () => {
    const gx = compileTemplate('Gx(dps): {gx:f.2}');
    const slots: Record<string, unknown> = {};
    appendParseSample(gx, undefined, 'Gx(dps): -50.00', 100, slots);
    expect([...(slots.gx as number[])]).toEqual([-50]);
    appendParseSample(gx, undefined, 'Gx(dps): -50.0', 200, slots);
    expect(slots.gx).toHaveLength(1);
  });
});
