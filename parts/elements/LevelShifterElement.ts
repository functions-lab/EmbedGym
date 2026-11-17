// 4-channel BSS138 bidirectional logic level converter, 14.5 × 12.5 mm at
// 96 dpi. Pin tips are the pad centres on 2.54 mm pitch; both GND pads read
// "GND" on the silkscreen.
const HV_ROW_Y = 4.5;
const LV_ROW_Y = 42.9;
const PAD_X = [3.4, 13, 22.6, 32.2, 41.8, 51.4];

const POWER: Record<string, Array<{ type: string; signal: string }>> = {
  HV: [{ type: 'power', signal: 'VCC' }],
  LV: [{ type: 'power', signal: 'VCC' }],
  'GND.1': [{ type: 'power', signal: 'GND' }],
  'GND.2': [{ type: 'power', signal: 'GND' }],
};

const ROWS: Array<[number, string[]]> = [
  [HV_ROW_Y, ['HV1', 'HV2', 'HV', 'GND.1', 'HV3', 'HV4']],
  [LV_ROW_Y, ['LV1', 'LV2', 'LV', 'GND.2', 'LV3', 'LV4']],
];

class LevelShifterElement extends HTMLElement {
  readonly pinInfo = ROWS.flatMap(([y, names], row) => names.map((name, i) => ({
    name, x: PAD_X[i], y, number: row * names.length + i + 1, signals: POWER[name] ?? [],
  })));

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="54.8" height="47.4" viewBox="0 0 54.8 47.4">
        <image href="/component-svgs/level-shifter.svg" width="54.8" height="47.4" />
      </svg>`;
  }
}

if (!customElements.get('velxio-level-shifter')) {
  customElements.define('velxio-level-shifter', LevelShifterElement);
}
