/**
 * WaterLevelSensorElement.ts — analog water level sensor module
 *
 * Velxio-native module (wokwi-elements has none). Pin names follow the
 * EmbedGym-Bench `task.json` spelling (`signal`), which is what circuit wiring
 * and role resolution key off.
 *
 * Geometry (CSS px, canvas 124 × 40, landscape like the real 62 × 20 mm board):
 *   Header: three pins leaving the left edge, tips at x = 0,
 *   y = 10 / 20 / 30 — GND (−), VCC (+), signal (S) top to bottom, as
 *   silkscreened on the board.
 *   Mounting holes above and below the labels, then the power LED, three
 *   resistors and the transistor, then the exposed sense traces: ten
 *   interleaved parallel strips running the length of the probe.
 */

const W = 124;
const H = 40;

const BOARD = '#c62828';
const BOARD_EDGE = '#7f1d1d';
const HOLE = '#f1f5f9';
const TRACE = '#c0c4cc';
const LABEL = '#f8fafc';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';
const LED_POWER = '#4ade80';
const RESISTOR = '#1f2937';
const RESISTOR_BAND = '#9ca3af';

const PIN_INFO = [
  { name: 'GND', x: 0, y: 10, number: 1, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'VCC', x: 0, y: 20, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'signal', x: 0, y: 30, number: 3, signals: [] as Array<unknown> },
];

class WaterLevelSensorElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Header on the left edge: − / + / S top to bottom. -->
        <line x1="0" y1="10" x2="12" y2="10" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="0" y1="20" x2="12" y2="20" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="0" y1="30" x2="12" y2="30" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <rect x="8" y="5" width="8" height="30" fill="${HEADER}"/>
        <text x="18" y="12" font-family="sans-serif" font-size="5.5" font-weight="bold" fill="${LABEL}">−</text>
        <text x="18" y="22" font-family="sans-serif" font-size="5.5" font-weight="bold" fill="${LABEL}">+</text>
        <text x="18" y="32" font-family="sans-serif" font-size="5.5" font-weight="bold" fill="${LABEL}">S</text>

        <!-- Mounting holes. -->
        <circle cx="20" cy="5.5" r="2.2" fill="${HOLE}" stroke="${BOARD_EDGE}" stroke-width="0.6"/>
        <circle cx="20" cy="34.5" r="2.2" fill="${HOLE}" stroke="${BOARD_EDGE}" stroke-width="0.6"/>

        <!-- Power LED, resistors and the transistor. -->
        <rect x="28" y="7" width="4" height="2.5" rx="0.5" fill="${LED_POWER}"/>
        <text x="30" y="16" text-anchor="middle" font-family="sans-serif" font-size="3" fill="${LABEL}">PWR</text>
        <rect x="37" y="7" width="6" height="2.5" rx="0.5" fill="${RESISTOR}"/>
        <rect x="37" y="13" width="6" height="2.5" rx="0.5" fill="${RESISTOR}"/>
        <rect x="37" y="31" width="6" height="2.5" rx="0.5" fill="${RESISTOR}"/>
        <line x1="40" y1="7" x2="40" y2="9.5" stroke="${RESISTOR_BAND}" stroke-width="1"/>
        <line x1="40" y1="13" x2="40" y2="15.5" stroke="${RESISTOR_BAND}" stroke-width="1"/>
        <line x1="40" y1="31" x2="40" y2="33.5" stroke="${RESISTOR_BAND}" stroke-width="1"/>
        <rect x="36" y="20" width="7" height="5" rx="0.8" fill="${RESISTOR}"/>

        <text x="50" y="20" transform="rotate(-90 50 20)" text-anchor="middle"
              font-family="monospace" font-size="5" font-weight="bold" fill="${LABEL}">WATER</text>

        <!-- Exposed sense traces: two interleaved combs, pads on the left comb. -->
        <path d="M 58 6.5 H 120 M 58 12.5 H 120 M 58 18.5 H 120 M 58 24.5 H 120 M 58 30.5 H 120"
              stroke="${TRACE}" stroke-width="1.6" fill="none"/>
        <path d="M 62 9.5 H 120 M 62 15.5 H 120 M 62 21.5 H 120 M 62 27.5 H 120 M 62 33.5 H 120"
              stroke="${TRACE}" stroke-width="1.6" fill="none"/>
        <circle cx="58" cy="6.5" r="1.4" fill="${TRACE}"/>
        <circle cx="58" cy="12.5" r="1.4" fill="${TRACE}"/>
        <circle cx="58" cy="18.5" r="1.4" fill="${TRACE}"/>
        <circle cx="58" cy="24.5" r="1.4" fill="${TRACE}"/>
        <circle cx="58" cy="30.5" r="1.4" fill="${TRACE}"/>
      </svg>`;
  }
}

if (!customElements.get('velxio-water-level-sensor')) {
  customElements.define('velxio-water-level-sensor', WaterLevelSensorElement);
}

export { WaterLevelSensorElement };
