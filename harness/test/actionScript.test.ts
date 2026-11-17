import { describe, it, expect } from 'vitest';
import { parseActionScript, ActionScriptError } from '../action_script';

const components = [
  { id: 'BTN1', metadataId: 'pushbutton' },
  { id: 'R1', metadataId: 'resistor-10k' },
  { id: 'DHT1', metadataId: 'dht11' },
  { id: 'LCD1', metadataId: 'lcd1602' },
  { id: 'KP1', metadataId: 'membrane-keypad' },
  { id: 'AMG1', metadataId: 'amg8833' },
  { id: 'SHOCK1', metadataId: 'shock-sensor' },
  { id: 'BAT1', metadataId: 'battery-9v' },
  { id: 'BLE1', metadataId: 'hm10' },
  { id: 'LS1', metadataId: 'level-shifter' },
];
const parse = (text: string) => parseActionScript(text, components, 5000);

describe('parseActionScript', () => {
  it('parses each kind and orders by time, ties in line order', () => {
    expect(parse([
      '2000 read LCD1.row0',
      '',
      '  1000 do BTN1.down  ',
      '1000 set DHT1.temperature = 28.5',
      '500 do KP1.#.down',
    ].join('\n'))).toEqual([
      { kind: 'do', at: 500, line: 5, text: 'do KP1.#.down', act: { role: 'KP1', key: '#', verb: 'down' } },
      { kind: 'do', at: 1000, line: 3, text: 'do BTN1.down', act: { role: 'BTN1', key: undefined, verb: 'down' } },
      { kind: 'set', at: 1000, line: 4, text: 'set DHT1.temperature = 28.5', id: 'DHT1', prop: 'temperature', value: 28.5 },
      { kind: 'read', at: 2000, line: 1, text: 'read LCD1.row0', id: 'LCD1', prop: 'row0' },
    ]);
  });

  it('accepts an empty script and CRLF line ends', () => {
    expect(parse('\n  \n')).toEqual([]);
    expect(parse('0 do BTN1.down\r\n5000 do BTN1.up\r\n').map((a) => a.text)).toEqual(['do BTN1.down', 'do BTN1.up']);
  });

  it.each(['1.5', '0', '5000'])('accepts time %s', (ms) => {
    expect(parse(`${ms} do BTN1.down`)[0].at).toBe(Number(ms));
  });

  it.each(['5001', '-5', 'abc', '1e3'])('rejects time %s', (ms) => {
    expect(() => parse(`${ms} do BTN1.down`)).toThrow(`line 1: time must be a number of ms from 0 to 5000, got '${ms}'`);
  });

  it.each(['KP1.0.down', 'KP1.D.up', 'KP1.*.down'])('accepts keyed do %s', (action) => {
    expect(parse(`0 do ${action}`)).toHaveLength(1);
  });

  it.each(['KP1.E.down', 'KP1.10.down', 'KP1.down', 'KP1.5.press'])('rejects keyed do %s', (action) => {
    expect(() => parse(`0 do ${action}`)).toThrow(/^line 1: KP1 has no action 'do KP1\./);
  });

  it.each(['pixel0', 'pixel63', 'thermistorTemperature'])('accepts slotted set prop %s', (prop) => {
    expect(parse(`0 set AMG1.${prop} = 30`)).toHaveLength(1);
  });

  it.each(['pixel64', 'pixel05', 'pixel'])('rejects slotted set prop %s', (prop) => {
    expect(() => parse(`0 set AMG1.${prop} = 30`)).toThrow(`line 1: AMG1 has no action 'set AMG1.${prop}'`);
  });

  it('checks set values against the hint', () => {
    expect(parse('0 set SHOCK1.shock = true')[0]).toMatchObject({ value: true });
    expect(parse('0 set DHT1.humidity = -1.5e1')[0]).toMatchObject({ value: -15 });
    for (const bad of ['0 set DHT1.temperature = true', "0 set DHT1.temperature = 'warm'", '0 set DHT1.temperature = 1e999']) {
      expect(() => parse(bad)).toThrow(`line 1: expected 'set DHT1.temperature = <°C>', got '${bad}'`);
    }
    expect(() => parse('0 set SHOCK1.shock = false')).toThrow("expected 'set SHOCK1.shock = true'");
  });

  it('rejects actions a part does not list', () => {
    expect(() => parse('0 read BTN1.pressed')).toThrow("line 1: BTN1 has no action 'read BTN1.pressed'");
    expect(() => parse('0 do BTN1.press')).toThrow("line 1: BTN1 has no action 'do BTN1.press'");
    expect(() => parse('0 set LCD1.row0 = 1')).toThrow("line 1: LCD1 has no action 'set LCD1.row0'");
    expect(() => parse('0 do BAT1.down')).toThrow("line 1: BAT1 has no action 'do BAT1.down'");
    expect(() => parse('0 do R1.down')).toThrow('line 1: R1 has no actions');
    expect(() => parse('0 do LS1.x')).toThrow('line 1: LS1 has no actions');
    expect(() => parse('0 do BTN2.down')).toThrow("line 1: no component 'BTN2'");
  });

  it('rejects malformed lines with their line number', () => {
    const cases: Array<[string, string]> = [
      ['press BTN1', "expected '<ms> do|set|read|send <ID>.…', got 'press BTN1'"],
      ['100 press BTN1.down', "expected '<ms> do|set|read|send <ID>.…'"],
      ['100 do BTN1', "expected '<ms> do <ID>.<verb>' or '<ms> do <ID>.<key>.<verb>'"],
      ['100 set DHT1.temperature 30', "expected '<ms> set <ID>.<prop> = <value>'"],
      ['100 read LCD1', "expected '<ms> read <ID>.<prop>'"],
    ];
    for (const [line, message] of cases) {
      expect(() => parse(`0 do BTN1.down\n${line}`)).toThrow(`line 2: ${message}`);
    }
  });

  it('parses send payloads as bytes', () => {
    expect(parse('1500 send BLE1.remote "1\\r\\n"\n100 send serial "AT\\u00ff"')).toEqual([
      { kind: 'send', at: 100, line: 2, text: 'send serial "AT\u00ff"', act: { endpoint: 'serial', bytes: [65, 84, 255] } },
      { kind: 'send', at: 1500, line: 1, text: 'send BLE1.remote "1\\r\\n"', act: { endpoint: 'remote', role: 'BLE1', bytes: [49, 13, 10] } },
    ]);
  });

  it('rejects bad send lines', () => {
    const usage = (line: string) => `line 1: expected '<ms> send <ID>.<endpoint> "<text>"' or '<ms> send serial "<text>"', got '${line}'`;
    for (const bad of ['0 send BLE1.remote 1', '0 send BLE1.remote ""', '0 send BLE1.remote "1', "0 send BLE1.remote '1'", '0 send BLE1 "1"', '0 send serial']) {
      expect(() => parse(bad)).toThrow(usage(bad));
    }
    expect(() => parse('0 send BLE1.remote "\u0100"')).toThrow("line 1: send text must use characters U+0000..U+00FF only");
    expect(() => parse('0 send BLE1.other "1"')).toThrow("line 1: BLE1 has no action 'send BLE1.other'");
    expect(() => parse('0 send BTN1.remote "1"')).toThrow("line 1: BTN1 has no action 'send BTN1.remote'");
    expect(() => parse('0 send BLE2.remote "1"')).toThrow("line 1: no component 'BLE2'");
  });

  it('keeps raw console bytes', () => {
    expect(parse('0 send serial "\\u0000\\r\\nÿ"')).toEqual([
      { kind: 'send', at: 0, line: 1, text: 'send serial "\\u0000\\r\\nÿ"', act: { endpoint: 'serial', bytes: [0, 13, 10, 255] } },
    ]);
  });

  it('raises script mistakes as ActionScriptError', () => {
    expect(() => parse('0 do BTN2.down')).toThrow(ActionScriptError);
  });

  it('treats a part type missing from part_actions.json as a harness bug', () => {
    const run = () => parseActionScript('0 do X1.down', [{ id: 'X1', metadataId: 'no-such-part' }], 5000);
    expect(run).toThrow("part_actions.json has no entry for 'no-such-part' (X1)");
    expect(run).not.toThrow(ActionScriptError);
  });
});
