import { describe, it, expect } from 'vitest';
import { SerialLineStore, compileTemplate, runParse } from '../serial_spec';

function storeWith(lines: Array<[string, number]>, eol = '\r\n'): SerialLineStore {
  const store = new SerialLineStore();
  for (const [text, t] of lines) {
    for (const ch of text + eol) store.pushByte(ch.charCodeAt(0), t);
  }
  return store;
}

const parse = (store: SerialLineStore, template: string, atMs: number, as?: string) =>
  Object.fromEntries(runParse(compileTemplate(template), as, store, atMs));

describe('SerialLineStore', () => {
  it('splits on newline and strips the carriage return', () => {
    const store = storeWith([['one', 10], ['two', 20]]);
    expect(store.lines).toEqual([{ text: 'one', t: 10 }, { text: 'two', t: 20 }]);
  });

  it('strips every trailing carriage return', () => {
    expect(storeWith([['$GPGGA,1*7A', 10]], '\r\r\n').lines).toEqual([{ text: '$GPGGA,1*7A', t: 10 }]);
    expect(storeWith([['a\rb', 10]], '\r\n').lines).toEqual([{ text: 'a\rb', t: 10 }]);
  });

  it('handles bare newlines', () => {
    expect(storeWith([['one', 10]], '\n').lines).toEqual([{ text: 'one', t: 10 }]);
  });

  // ESP-IDF's console translates '\n' to '\r\n', so a firmware forwarding a
  // CRLF-terminated stream verbatim (gps_raw_msg) prints '\r\r\n'.
  it('strips every trailing carriage return', () => {
    expect(storeWith([['$GPGGA,1*7A', 10]], '\r\r\n').lines).toEqual([{ text: '$GPGGA,1*7A', t: 10 }]);
  });

  it('withholds a line that has no newline yet', () => {
    const store = storeWith([['done', 10]]);
    for (const ch of 'partial') store.pushByte(ch.charCodeAt(0), 20);
    expect(store.lines).toEqual([{ text: 'done', t: 10 }]);
  });

  it('includes lines printed exactly at the cutoff', () => {
    const store = storeWith([['a', 100], ['b', 200], ['c', 201]]);
    expect(store.linesAsOf(200).map((l) => l.text)).toEqual(['a', 'b']);
  });

  // On ESP32 the t=0 axis starts at app start, so the ROM/bootloader log is
  // stamped negative. Those lines stay in `lines` for serial-mode dumps but
  // must never reach a parse row.
  it('excludes lines printed before t=0', () => {
    const store = storeWith([['boot', -492], ['entry', -447], ['app', 300]]);
    expect(store.linesAsOf(1000).map((l) => l.text)).toEqual(['app']);
    expect(store.lines).toHaveLength(3);
  });

  it('includes a line printed exactly at t=0', () => {
    const store = storeWith([['zero', 0]]);
    expect(store.linesAsOf(100).map((l) => l.text)).toEqual(['zero']);
  });
});

describe('runParse', () => {
  const store = storeWith([['Steps: 1', 100], ['noise', 150], ['Steps: 2', 250], ['Steps: 3', 900]]);

  it('collects matching values in print order with their timestamps', () => {
    const slots = parse(store, 'Steps: {n:d}', 900);
    expect([...slots.n]).toEqual([1, 2, 3]);
    expect(slots.n.t).toEqual([100, 250, 900]);
  });

  it('only sees lines printed by `at`', () => {
    expect([...parse(store, 'Steps: {n:d}', 300).n]).toEqual([1, 2]);
  });

  it('binds an empty list when nothing matches', () => {
    const slots = parse(store, 'Motion Detected!', 900, 'motion');
    expect([...slots.motion]).toEqual([]);
    expect(slots.motion.t).toEqual([]);
  });

  it('binds whole line texts via `as`', () => {
    const slots = parse(store, 'Steps: {d}', 900, 'steps');
    expect([...slots.steps]).toEqual(['Steps: 1', 'Steps: 2', 'Steps: 3']);
    expect(slots.steps.t).toEqual([100, 250, 900]);
  });

  it('binds one list per named placeholder', () => {
    const readings = storeWith([['T: 34 C, H: 71 %', 50], ['T: 29 C, H: 85 %', 80]]);
    const slots = parse(readings, 'T: {t:d} C, H: {h:d} %', 100);
    expect([...slots.t]).toEqual([34, 29]);
    expect([...slots.h]).toEqual([71, 85]);
  });
});
