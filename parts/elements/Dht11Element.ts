/**
 * Dht11Element.ts — DHT11 single-wire temperature / humidity sensor.
 *
 * wokwi-elements ships a DHT22 but no DHT11, so this is a Velxio-native part
 * drawn as the familiar blue perforated housing on a small breakout, with
 * three leads dropping out the bottom.
 *
 * Pin names are VCC / DATA / GND, as the EmbedGym-Bench `task.json` files spell
 * them.
 *
 * Geometry (CSS px, canvas 60 × 84):
 *   Body: rounded rect spanning x 6..54, y 4..52, grille holes across the face.
 *   Leads: three verticals at x = 16 / 30 / 44 running y 52..84.
 *   Pin tips sit at the lead ends (y = 84) so wires attach below the package.
 */

const W = 60;
const H = 84;
const PIN_Y = 84;

const BODY = '#3a6ea5';
const BODY_EDGE = '#27507a';
const HOLE = '#1b3a5c';
const LEAD = '#b8b8b8';
const LABEL = '#eaf2fa';

const PIN_INFO = [
  { name: 'VCC', x: 16, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'DATA', x: 30, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'GND', x: 44, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
];

// Grille holes across the sensor face, in rows of four.
const HOLES = [14, 24, 34, 44].flatMap((x) => [16, 26, 36].map((y) => ({ x, y })));

class Dht11Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  temperature = 25;
  humidity = 50;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <!-- Leads first so the body overlaps their top ends. -->
        <line x1="16" y1="48" x2="16" y2="${PIN_Y}" stroke="${LEAD}" stroke-width="2.5"/>
        <line x1="30" y1="48" x2="30" y2="${PIN_Y}" stroke="${LEAD}" stroke-width="2.5"/>
        <line x1="44" y1="48" x2="44" y2="${PIN_Y}" stroke="${LEAD}" stroke-width="2.5"/>

        <rect x="6" y="4" width="48" height="48" rx="3"
              fill="${BODY}" stroke="${BODY_EDGE}" stroke-width="1.2"/>
        ${HOLES.map((h) => `<circle cx="${h.x}" cy="${h.y}" r="2.6" fill="${HOLE}"/>`).join('')}
        <text x="30" y="47" text-anchor="middle" font-family="monospace"
              font-size="8" font-weight="bold" fill="${LABEL}">DHT11</text>

        <!-- Pin labels tucked between the leads. -->
        <text x="16" y="64" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">VCC</text>
        <text x="30" y="72" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">DATA</text>
        <text x="44" y="64" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">GND</text>
      </svg>`;
  }
}

if (!customElements.get('velxio-dht11')) {
  customElements.define('velxio-dht11', Dht11Element);
}
