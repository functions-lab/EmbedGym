import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  checkPeerUse,
  parseJsonl,
  parseParse,
  isParseRow,
  type Row,
  type PeerSchema,
} from '../jsonl_spec';

// The runner resolves roles against the loaded circuit; here every role exists.
const anyRole = (name: string) => `component-${name}`;
const noRoles = (name: string): string => {
  throw new Error(`unknown role '${name}'`);
};

const TARGET = 'atmega2560_arduino';
const build = (lines: string[], roleId = anyRole) =>
  buildTimeline(parseJsonl(lines.join('\n'), TARGET), roleId);

describe('buildTimeline ordering', () => {
  it('sorts events by `at`', () => {
    const { events } = build([
      '{"at": 900, "expect": "led.value == true"}',
      '{"at": 100, "do": "button.down"}',
      '{"at": 500, "set": "s.temperature = 3"}',
    ]);
    expect(events.map((e) => e.at_ms)).toEqual([100, 500, 900]);
    expect(events.map((e) => e.kind)).toEqual(['do', 'set', 'expect']);
  });

  it('keeps file order for rows sharing an `at`, so a parse precedes its expects', () => {
    const { events } = build([
      '{"at": 500, "parse": "D: {d:d}"}',
      '{"at": 500, "expect": "@d[-1] == 1"}',
    ]);
    expect(events.map((e) => e.kind)).toEqual(['parse', 'expect']);
  });

  it('ignores circuit rows (they bind roles, not events)', () => {
    const { events } = build([
      `{"target": "${TARGET}", "part": "led", "name": "led", "pin": 3}`,
      '{"at": 100, "expect": "led.value == true"}',
    ]);
    expect(events).toHaveLength(1);
  });
});

describe('buildTimeline compiles serial artifacts', () => {
  it('compiles each parse template once, keyed by source', () => {
    const { templates } = build([
      '{"at": 100, "parse": "D: {dist:d} cm"}',
      '{"at": 900, "parse": "D: {dist:d} cm"}',
    ]);
    expect([...templates.keys()]).toEqual(['D: {dist:d} cm']);
    expect(templates.get('D: {dist:d} cm')!.fields).toEqual([{ name: 'dist', type: 'd' }]);
  });

  it('compiles slot expressions ahead of the run', () => {
    const { slotExprs } = build([
      '{"at": 100, "parse": "D: {dist:d}"}',
      '{"at": 200, "expect": "@dist[-1] == 5"}',
    ]);
    expect(slotExprs.has('@dist[-1] == 5')).toBe(true);
  });
});

describe('buildTimeline rejects unusable rows at load time', () => {
  it('rejects a parse that binds nothing', () => {
    expect(() => build(['{"at": 100, "parse": "Button Pressed!"}']))
      .toThrow(/binds nothing/);
  });

  it('accepts a placeholder-free template when `as` names the slot', () => {
    const { templates } = build(['{"at": 100, "parse": "Button Pressed!", "as": "presses"}']);
    expect(templates.get('Button Pressed!')!.fields).toHaveLength(0);
  });

  it('rejects an expect reading a slot nothing binds', () => {
    expect(() => build(['{"at": 100, "expect": "@nope[-1] == 1"}']))
      .toThrow(/reads slot '@nope' before anything binds it/);
  });

  it('rejects an expect reading a slot bound only later', () => {
    expect(() => build([
      '{"at": 100, "expect": "@dist[-1] == 1"}',
      '{"at": 200, "parse": "D: {dist:d}"}',
    ])).toThrow(/before anything binds it/);
  });

  it('accepts a slot bound by an earlier capture row', () => {
    expect(() => build([
      '{"at": 100, "capture": "b1 = led.brightness"}',
      '{"at": 200, "expect": "@b1 > 0"}',
    ])).not.toThrow();
  });

  it('accepts a slot bound by `as`', () => {
    expect(() => build([
      '{"at": 100, "parse": "Hit!", "as": "hits"}',
      '{"at": 200, "expect": "len(@hits) == 1"}',
    ])).not.toThrow();
  });

  it('rejects a malformed parse template', () => {
    expect(() => build(['{"at": 100, "parse": "D: {bogus}"}']))
      .toThrow(/malformed placeholder/);
  });

  it('rejects a chained comparison in an expect', () => {
    expect(() => build([
      '{"at": 100, "parse": "D: {d:d}"}',
      '{"at": 200, "expect": "1 < @d[-1] < 9"}',
    ])).toThrow(/chained comparison/);
  });

  it('rejects an unknown role in every row kind that names one', () => {
    for (const row of [
      '{"at": 100, "expect": "ghost.value == true"}',
      '{"at": 100, "set": "ghost.temperature = 1"}',
      '{"at": 100, "do": "ghost.down"}',
      '{"at": 100, "capture": "x = ghost.brightness"}',
    ]) {
      expect(() => build([row], noRoles), row).toThrow(/unknown role 'ghost'/);
    }
  });

  it('does not ask roleId about slot expressions', () => {
    expect(() => build([
      '{"at": 100, "parse": "D: {d:d}"}',
      '{"at": 200, "expect": "@d[-1] == 1"}',
    ], noRoles)).not.toThrow();
  });
});

describe('buildTimeline (parse with `from`)', () => {
  it('resolves the `from` role', () => {
    expect(() => build(['{"at": 100, "parse": "T: {t:d}", "from": "ghost.row0"}'], noRoles))
      .toThrow(/unknown role 'ghost'/);
  });

  it('binds a slot a later expect can read', () => {
    expect(() => build([
      '{"at": 100, "parse": "T: {t:d}", "from": "lcd.row0"}',
      '{"at": 200, "expect": "@t[-1] > 5"}',
    ])).not.toThrow();
  });

  it('still requires the template to bind something', () => {
    expect(() => build(['{"at": 100, "parse": "Timing...", "from": "lcd.row0"}']))
      .toThrow(/binds nothing/);
  });

  it('accepts a placeholder-free `from` template with `as`', () => {
    expect(() => build([
      '{"at": 100, "parse": "Status: Success", "as": "ok", "from": "lcd.row1"}',
      '{"at": 200, "expect": "len(@ok) == 1"}',
    ])).not.toThrow();
  });

  it('lets the same slot be re-bound by the same kind of row', () => {
    expect(() => build([
      '{"at": 100, "parse": "T: {t:d}", "from": "lcd.row0"}',
      '{"at": 200, "parse": "T: {t:d}", "from": "lcd.row0"}',
    ])).not.toThrow();
  });

  it('rejects binding one slot as both a serial-parse and a prop-parse slot', () => {
    expect(() => build([
      '{"at": 100, "parse": "T: {t:d}"}',
      '{"at": 200, "parse": "T: {t:d}", "from": "lcd.row0"}',
    ])).toThrow(/already a serial-parse slot/);
    expect(() => build([
      '{"at": 100, "parse": "T: {t:d}", "from": "lcd.row0"}',
      '{"at": 200, "parse": "T: {t:d}"}',
    ])).toThrow(/already a prop-parse slot/);
  });

  it('rejects binding one slot as both a capture and a prop-parse slot', () => {
    expect(() => build([
      '{"at": 100, "capture": "t = led.brightness"}',
      '{"at": 200, "parse": "T: {t:d}", "from": "lcd.row0"}',
    ])).toThrow(/already a capture slot/);
  });

  it('leaves a bad row index to the runner (deriveRowProp owns it)', () => {
    expect(() => build(['{"at": 100, "expect": "lcd.row5 == \'x\'"}'])).not.toThrow();
  });
});

describe('parse row helpers', () => {
  it('isParseRow discriminates parse rows', () => {
    const rows = parseJsonl([
      '{"at": 100, "parse": "D: {d:d}"}',
      '{"at": 100, "expect": "led.value == true"}',
    ].join('\n'), TARGET);
    expect(rows.filter(isParseRow)).toHaveLength(1);
  });

  it('parseParse carries the template and optional `as`', () => {
    expect(parseParse({ at: 1, parse: 'D: {d:d}' })).toEqual({ template: 'D: {d:d}', as: undefined });
    expect(parseParse({ at: 1, parse: 'Hit!', as: 'hits' })).toEqual({ template: 'Hit!', as: 'hits' });
  });

  it('parseParse splits `from` into role and prop', () => {
    expect(parseParse({ at: 1, parse: 'T: {t:d}', from: 'lcd.row0' }))
      .toEqual({ template: 'T: {t:d}', as: undefined, from: { role: 'lcd', prop: 'row0' } });
  });

  it('parseParse rejects an empty template', () => {
    expect(() => parseParse({ at: 1, parse: '   ' } as Row as never)).toThrow(/empty template/);
  });
});

describe('buildTimeline (peer role)', () => {
  const ESP = 'esp32s3_espidf';
  const WIFI = `{"target": "${ESP}", "part": "wifi", "name": "wifi"}`;
  const PEER = `{"target": "${ESP}", "peer": "peer.py", "name": "cloud"}`;
  const schema: PeerSchema = { actions: ['heater_on', 'ping'], props: ['temps', 'payloads_valid', 'last_body'] };
  const buildPeer = (lines: string[], peer: PeerSchema | null = schema, roleId = anyRole) => {
    const timeline = buildTimeline(parseJsonl(lines.join('\n'), ESP), roleId);
    checkPeerUse(timeline, peer);
    return timeline;
  };

  it('flags each row that addresses the peer', () => {
    const { events } = buildPeer([
      WIFI,
      PEER,
      `{"target": "${ESP}", "part": "led", "name": "led", "pin": 10}`,
      '{"at": 3000, "do": "cloud.heater_on"}',
      '{"at": 3500, "expect": "cloud.temps == 3"}',
      '{"at": 3500, "expect": "cloud.payloads_valid == true"}',
      '{"at": 3500, "expect": "cloud.temps >= 2"}',
      '{"at": 3500, "expect": "cloud.last_body contains \'ON\'"}',
      '{"at": 3500, "capture": "n = cloud.temps"}',
      '{"at": 3500, "parse": "T={t:d}", "from": "cloud.last_body"}',
      '{"at": 3500, "expect": "led.value == true"}',
      '{"at": 3500, "do": "button.down"}',
      '{"at": 3500, "parse": "IP: {ip:s}"}',
      '{"at": 3600, "expect": "@n == 3"}',
    ]);
    expect(events.map((e) => [e.kind, e.peer])).toEqual([
      ['do', true],
      ['expect', true],
      ['expect', true],
      ['expect', true],
      ['expect', true],
      ['capture', true],
      ['parse', true],
      ['expect', false],
      ['do', false],
      ['parse', false],
      ['expect', false],
    ]);
  });

  it('marks every row of a task without a peer as a component row', () => {
    const { events } = build([
      '{"at": 100, "do": "button.down"}',
      '{"at": 200, "expect": "led.value == true"}',
      '{"at": 200, "capture": "b = led.brightness"}',
    ]);
    expect(events.every((e) => e.peer === false)).toBe(true);
  });

  it('never asks roleId about the peer role', () => {
    const peerRows = [
      '{"at": 3000, "do": "cloud.ping"}',
      '{"at": 3500, "expect": "cloud.temps == 1"}',
      '{"at": 3500, "capture": "n = cloud.temps"}',
      '{"at": 3500, "parse": "T={t:d}", "from": "cloud.last_body"}',
    ];
    expect(() => buildPeer([WIFI, PEER, ...peerRows], schema, noRoles)).not.toThrow();
    expect(() => buildPeer([WIFI, PEER, '{"at": 3500, "expect": "led.value == true"}'], schema, noRoles))
      .toThrow(/unknown role 'led'/);
  });

  it('rejects an action the peer does not have, listing its actions', () => {
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "do": "cloud.heater_off"}']))
      .toThrow("do 'cloud.heater_off': peer 'cloud' has no action 'heater_off' (actions: heater_on, ping)");
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "do": "cloud.temps"}']))
      .toThrow(/has no action 'temps'/);
  });

  it('rejects a property the peer does not have, listing its props', () => {
    const props = '(props: temps, payloads_valid, last_body)';
    expect(() => buildPeer([WIFI, PEER, '{"at": 3500, "expect": "cloud.heater_on == true"}']))
      .toThrow(`expect 'cloud.heater_on == true': peer 'cloud' has no property 'heater_on' ${props}`);
    expect(() => buildPeer([WIFI, PEER, '{"at": 3500, "expect": "cloud.nope contains \'x\'"}']))
      .toThrow(/has no property 'nope'/);
    expect(() => buildPeer([WIFI, PEER, '{"at": 3500, "capture": "n = cloud.nope"}']))
      .toThrow(`capture 'n = cloud.nope': peer 'cloud' has no property 'nope' ${props}`);
    expect(() => buildPeer([WIFI, PEER, '{"at": 3500, "parse": "T={t:d}", "from": "cloud.nope"}']))
      .toThrow(`parse 'T={t:d}' from 'cloud.nope': peer 'cloud' has no property 'nope' ${props}`);
  });

  it('says "none" when the schema lists no actions or props', () => {
    const empty: PeerSchema = { actions: [], props: [] };
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "do": "cloud.ping"}'], empty))
      .toThrow(/\(actions: none\)/);
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "expect": "cloud.temps == 1"}'], empty))
      .toThrow(/\(props: none\)/);
  });

  it('rejects an expect on the bare peer role', () => {
    expect(() => buildPeer([WIFI, PEER, '{"at": 3500, "expect": "cloud == true"}']))
      .toThrow(/peer 'cloud' needs a property/);
  });

  it('rejects set on the peer role', () => {
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "set": "cloud.temps = 3"}']))
      .toThrow(/set 'cloud.temps = 3': peer 'cloud' takes no set/);
  });

  it('rejects a keyed do on the peer role', () => {
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "do": "cloud.ping.down"}']))
      .toThrow(/do 'cloud.ping.down': peer actions take no key/);
  });

  it('requires a wifi circuit row for the same target', () => {
    expect(() => buildPeer([PEER, '{"at": 3000, "do": "cloud.ping"}']))
      .toThrow(/peer row 'cloud' needs a 'wifi' circuit row for target 'esp32s3_espidf'/);
    const otherTargetWifi = '{"target": "atmega2560_arduino", "part": "wifi", "name": "wifi"}';
    expect(() => buildPeer([otherTargetWifi, PEER]))
      .toThrow(/needs a 'wifi' circuit row/);
  });

  it('rejects a peer role name that a circuit row also declares', () => {
    const clash = `{"target": "${ESP}", "part": "led", "name": "cloud", "pin": 10}`;
    expect(() => buildPeer([WIFI, clash, PEER]))
      .toThrow(/role 'cloud' is declared by both a circuit row and the peer row/);
  });

  it('pairs the peer row with a schema', () => {
    expect(() => buildPeer([WIFI, PEER], null))
      .toThrow(/peer row 'cloud' needs the loaded peer's schema/);
    expect(() => buildPeer([WIFI, '{"at": 3000, "expect": "led.value == true"}'], schema))
      .toThrow(/a peer schema was given, but test.jsonl has no peer row/);
  });

  it('checks all but the peer\'s schema before the schema is known', () => {
    const rows = (extra: string) => parseJsonl([WIFI, PEER, '{"at": 3000, "do": "cloud.nope"}', extra].join('\n'), ESP);
    const timeline = buildTimeline(rows('{"at": 3500, "expect": "cloud.missing == 1"}'), anyRole);
    expect(timeline.peer).toEqual({
      name: 'cloud',
      uses: [
        { kind: 'action', name: 'nope', where: "do 'cloud.nope'" },
        { kind: 'property', name: 'missing', where: "expect 'cloud.missing == 1'" },
      ],
    });
    expect(() => checkPeerUse(timeline, schema)).toThrow(/do 'cloud.nope': peer 'cloud' has no action 'nope'/);
    expect(() => buildTimeline(rows('{"at": 3500, "expect": "led.value == true"}'), noRoles))
      .toThrow(/unknown role 'led'/);
    expect(() => buildTimeline(rows('{"at": 3500, "parse": "T={t:q}"}'), anyRole))
      .toThrow("malformed placeholder in template 'T={t:q}' at offset 2");
  });

  it('leaves component roles to roleId alongside a peer', () => {
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "set": "ghost.temperature = 1"}'], schema, noRoles))
      .toThrow(/unknown role 'ghost'/);
    expect(() => buildPeer([WIFI, PEER, '{"at": 3000, "do": "ghost.down"}'], schema, noRoles))
      .toThrow(/unknown role 'ghost'/);
  });
});

describe('buildTimeline (peer radio part)', () => {
  const ESP = 'esp32s3_espidf';
  const ESP_ARDUINO = 'esp32s3_arduino';
  const NRF = 'nrf52840_zephyr';
  const NRF_ARDUINO = 'nrf52840_arduino';
  const AVR = 'atmega2560_arduino';
  const schema: PeerSchema = { actions: ['pause'], props: ['reports'] };
  const radio = (target: string, part: string) => `{"target": "${target}", "part": "${part}", "name": "${part}"}`;
  const peerRow = (target: string) => `{"target": "${target}", "peer": "peer.py", "name": "phone"}`;
  const buildOn = (target: string, lines: string[], peer: PeerSchema | null = schema) => {
    const timeline = buildTimeline(parseJsonl(lines.join('\n'), target), anyRole);
    checkPeerUse(timeline, peer);
    return timeline;
  };

  it('drives an nRF peer next to a ble row', () => {
    const { events } = buildOn(NRF, [
      radio(NRF, 'ble'),
      peerRow(NRF),
      '{"at": 2500, "do": "phone.pause"}',
      '{"at": 3000, "expect": "phone.reports == 0"}',
    ]);
    expect(events.map((e) => [e.kind, e.peer])).toEqual([['do', true], ['expect', true]]);
  });

  it('drives an nrf52840_arduino peer next to a ble row', () => {
    const { events } = buildOn(NRF_ARDUINO, [
      radio(NRF_ARDUINO, 'ble'),
      peerRow(NRF_ARDUINO),
      '{"at": 2500, "do": "phone.pause"}',
      '{"at": 3000, "expect": "phone.reports == 0"}',
    ]);
    expect(events.map((e) => [e.kind, e.peer])).toEqual([['do', true], ['expect', true]]);
  });

  it('drives an esp32s3_arduino peer next to a wifi row', () => {
    const { events } = buildOn(ESP_ARDUINO, [
      radio(ESP_ARDUINO, 'wifi'),
      peerRow(ESP_ARDUINO),
      '{"at": 3000, "do": "phone.pause"}',
      '{"at": 3500, "expect": "phone.reports == 0"}',
    ]);
    expect(events.map((e) => [e.kind, e.peer])).toEqual([['do', true], ['expect', true]]);
  });

  it('needs the ble row on the nRF52840 targets and the wifi row on the ESP32-S3 targets', () => {
    expect(() => buildOn(NRF, [peerRow(NRF)]))
      .toThrow("peer row 'phone' needs a 'ble' circuit row for target 'nrf52840_zephyr'");
    expect(() => buildOn(NRF, [radio(NRF, 'wifi'), peerRow(NRF)]))
      .toThrow(/needs a 'ble' circuit row/);
    expect(() => buildOn(NRF_ARDUINO, [radio(NRF_ARDUINO, 'wifi'), peerRow(NRF_ARDUINO)]))
      .toThrow("peer row 'phone' needs a 'ble' circuit row for target 'nrf52840_arduino'");
    expect(() => buildOn(ESP, [radio(ESP, 'ble'), peerRow(ESP)]))
      .toThrow("peer row 'phone' needs a 'wifi' circuit row for target 'esp32s3_espidf'");
    expect(() => buildOn(ESP_ARDUINO, [radio(ESP_ARDUINO, 'ble'), peerRow(ESP_ARDUINO)]))
      .toThrow("peer row 'phone' needs a 'wifi' circuit row for target 'esp32s3_arduino'");
  });

  it('rejects a peer row on a target that runs no peer, before asking for a schema', () => {
    const message = "peer row 'phone': target 'atmega2560_arduino' runs no peer.py (peers run on esp32s3_espidf, esp32s3_arduino, nrf52840_zephyr, nrf52840_arduino)";
    expect(() => buildOn(AVR, [radio(AVR, 'wifi'), peerRow(AVR)])).toThrow(message);
    expect(() => buildOn(AVR, [radio(AVR, 'ble'), peerRow(AVR)], null)).toThrow(message);
  });
});
