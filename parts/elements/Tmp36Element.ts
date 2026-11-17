/**
 * Tmp36Element.ts — TMP36 analog temperature sensor (TO-92 package)
 *
 * wokwi-elements has no TMP36, so this is a Velxio-native part drawn as an
 * SVG schematic-style TO-92: rounded body with the characteristic flat face,
 * three leads dropping out the bottom.
 *
 * Pin order is the datasheet order read with the flat face toward the viewer,
 * left to right: +VS, VOUT, GND. The names here are `VCC` / `Vout` / `GND` to
 * match the EmbedGym-Bench `task.json` spelling (all three TMP36 tasks use
 * `Vout`), which is what circuit wiring and role resolution key off.
 *
 * Geometry (CSS px, canvas 60 × 76):
 *   Body: rounded rect spanning x 8..52, y 4..44, flat face at the bottom.
 *   Leads: three verticals at x = 16 / 30 / 44 running y 44..76.
 *   Pin tips sit at the lead ends (y = 76) so wires attach below the package.
 */

const W = 60;
const H = 76;
const PIN_Y = 76;

const BODY = '#2b2b2b';
const BODY_EDGE = '#6f6f6f';
const LEAD = '#b8b8b8';
const LABEL = '#d0d0d0';

const PIN_INFO = [
  { name: 'VCC', x: 16, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'Vout', x: 30, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'GND', x: 44, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
];

class Tmp36Element extends HTMLElement {
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
        <text x="30" y="26" text-anchor="middle" font-family="monospace"
              font-size="9" font-weight="bold" fill="${LABEL}">TMP36</text>

        <!-- Pin labels tucked between the leads. -->
        <text x="16" y="56" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">VCC</text>
        <text x="30" y="64" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">Vout</text>
        <text x="44" y="56" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">GND</text>
      </svg>`;
  }
}

if (!customElements.get('velxio-tmp36')) {
  customElements.define('velxio-tmp36', Tmp36Element);
}
