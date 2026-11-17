/**
 * ShockSensorElement.ts — KY-002 style shock/vibration sensor module
 *
 * Velxio-native module (wokwi-elements has none). Pin names follow the
 * EmbedGym-Bench `task.json` spelling (`signal`), which is what circuit wiring
 * and role resolution key off. Click the element (or use the sensor panel /
 * harness `set <role>.shock = true`) to fire a momentary HIGH pulse.
 *
 * Geometry (CSS px, canvas 64 × 60):
 *   Board: rounded rect spanning the full canvas.
 *   Spring sensor: black cylinder from the top edge down to its two solder
 *   contacts; the 10k pull-down sits to its right.
 *   Header: three pins along the bottom edge at x = 16 / 32 / 48.
 */

const W = 64;
const H = 60;
const PIN_Y = 60;

const BOARD = '#1e5b2f';
const BOARD_EDGE = '#0d3b1c';
const CAN = '#1f2937';
const CAN_CAP = '#4b5563';
const CAN_EDGE = '#6b7280';
const CONTACT = '#b87333';
const PAD = '#c9ccd1';
const RESISTOR = '#2b2b2b';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_INFO = [
  { name: 'signal', x: 16, y: PIN_Y, number: 1, signals: [] as Array<unknown> },
  { name: 'VCC', x: 32, y: PIN_Y, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'GND', x: 48, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
];

class ShockSensorElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; cursor: pointer; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 10}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Through-hole pads. -->
        <circle cx="12" cy="8" r="2.2" fill="${PAD}"/>
        <circle cx="52" cy="8" r="2.2" fill="${PAD}"/>
        <circle cx="14" cy="39" r="2" fill="${PAD}"/>
        <circle cx="50" cy="39" r="2" fill="${PAD}"/>

        <!-- Spring-in-tube shock element: black can with its two contacts. -->
        <rect x="20" y="2" width="24" height="34" rx="4"
              fill="${CAN}" stroke="${CAN_EDGE}" stroke-width="1.2"/>
        <rect x="22" y="2.5" width="20" height="3" rx="1.5" fill="${CAN_CAP}"/>
        <rect x="25" y="35" width="5" height="3" fill="${CONTACT}"/>
        <rect x="34" y="35" width="5" height="3" fill="${CONTACT}"/>

        <!-- 10k pull-down resistor. -->
        <rect x="49" y="15" width="7" height="12" rx="1" fill="${RESISTOR}"/>
        <text x="52.5" y="22.5" text-anchor="middle" font-family="sans-serif"
              font-size="3.5" fill="${LABEL}">103</text>

        <text transform="translate(9 42) rotate(-90)" font-family="monospace"
              font-size="6" font-weight="bold" fill="${LABEL}">KY-002</text>

        <!-- Header strip and the three pins. -->
        <rect x="6" y="${H - 12}" width="52" height="7" fill="${HEADER}"/>
        <line x1="16" y1="${H - 10}" x2="16" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="32" y1="${H - 10}" x2="32" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="48" y1="${H - 10}" x2="48" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <text x="16" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">signal</text>
        <text x="32" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">VCC</text>
        <text x="48" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">GND</text>
      </svg>`;
  }
}

if (!customElements.get('velxio-shock-sensor')) {
  customElements.define('velxio-shock-sensor', ShockSensorElement);
}

export { ShockSensorElement };
