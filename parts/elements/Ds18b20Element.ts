/**
 * Ds18b20Element.ts — DS18B20 1-Wire temperature sensor (TO-92 package)
 *
 * wokwi-elements has no DS18B20, so this is a Velxio-native part drawn like
 * the TMP36: rounded TO-92 body with the flat face toward the viewer, three
 * leads dropping out the bottom.
 *
 * Pin order is the datasheet order with the flat face toward the viewer,
 * left to right: GND, DQ, VDD. The names are `GND` / `data` / `VCC` — `data`
 * (lowercase) matches the EmbedGym-Bench `task.json` spelling, which is what
 * circuit wiring and role resolution key off.
 *
 * Geometry (CSS px, canvas 60 × 76): same TO-92 as Tmp36Element.
 */

const W = 60;
const H = 76;
const PIN_Y = 76;

const BODY = '#2b2b2b';
const BODY_EDGE = '#6f6f6f';
const LEAD = '#b8b8b8';
const LABEL = '#d0d0d0';

const PIN_INFO = [
  { name: 'GND', x: 16, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'data', x: 30, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'VCC', x: 44, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'VCC' }] },
];

class Ds18b20Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <!-- Leads first so the body overlaps their top ends. -->
        <line x1="16" y1="40" x2="16" y2="${PIN_Y}" stroke="${LEAD}" stroke-width="2.5"/>
        <line x1="30" y1="40" x2="30" y2="${PIN_Y}" stroke="${LEAD}" stroke-width="2.5"/>
        <line x1="44" y1="40" x2="44" y2="${PIN_Y}" stroke="${LEAD}" stroke-width="2.5"/>

        <!-- TO-92 body: domed top, flat face along the bottom edge. -->
        <path d="M 8 30 A 22 26 0 0 1 52 30 L 52 44 L 8 44 Z"
              fill="${BODY}" stroke="${BODY_EDGE}" stroke-width="1.2"/>
        <text x="30" y="22" text-anchor="middle" font-family="monospace"
              font-size="7" font-weight="bold" fill="${LABEL}">DS18B20</text>

        <!-- Pin labels tucked between the leads. -->
        <text x="16" y="56" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">GND</text>
        <text x="30" y="64" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">data</text>
        <text x="44" y="56" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">VCC</text>
      </svg>`;
  }
}

if (!customElements.get('velxio-ds18b20')) {
  customElements.define('velxio-ds18b20', Ds18b20Element);
}

export { Ds18b20Element };
