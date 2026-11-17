/**
 * Ky008LaserElement.ts — KY-008 laser emitter module
 *
 * Velxio-native module (wokwi-elements has none). Pin names follow the
 * EmbedGym-Bench `task.json` spelling (`signal`), which is what circuit wiring
 * and role resolution key off.
 *
 * The `laserOn` property is the whole state: true = signal HIGH, beam drawn.
 *
 * Geometry (CSS px, canvas 64 × 60):
 *   Board: rounded rect spanning the full canvas.
 *   Laser diode: brass barrel pointing up, away from the header, as on the
 *   real module; beam extends past the top edge when on.
 *   Header: three pins along the bottom edge at x = 16 / 32 / 48.
 */

const W = 64;
const H = 60;
const PIN_Y = 60;

const BOARD = '#7f1d1d';
const BOARD_EDGE = '#450a0a';
const BARREL = '#d4a017';
const BARREL_EDGE = '#8a6a0f';
const BEAM = '#ff2020';
const RESISTOR = '#2b2b2b';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_INFO = [
  { name: 'signal', x: 16, y: PIN_Y, number: 1, signals: [] as Array<unknown> },
  { name: 'VCC', x: 32, y: PIN_Y, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'GND', x: 48, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
];

class Ky008LaserElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _laserOn = false;

  static get observedAttributes() {
    return ['laseron'];
  }

  get laserOn() {
    return this._laserOn;
  }

  set laserOn(value: boolean) {
    const next = value === true || (value as unknown) === 'true';
    if (next === this._laserOn) return;
    this._laserOn = next;
    this.update();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'laseron') this.laserOn = value !== null && value !== 'false';
  }

  private update() {
    const root = this.shadowRoot;
    if (!root) return;
    const beam = root.querySelector('#beam') as SVGLineElement | null;
    if (beam) beam.setAttribute('visibility', this._laserOn ? 'visible' : 'hidden');
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 10}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Brass laser barrel pointing up; beam appears when driven. -->
        <rect x="26" y="10" width="12" height="26" rx="3"
              fill="${BARREL}" stroke="${BARREL_EDGE}" stroke-width="1.2"/>
        <rect x="29" y="4" width="6" height="6" fill="${BARREL_EDGE}"/>
        <line id="beam" x1="32" y1="4" x2="32" y2="-26" visibility="hidden"
              stroke="${BEAM}" stroke-width="2.5" stroke-linecap="round"/>

        <!-- Current-limiting SMD resistor. -->
        <rect x="8" y="16" width="7" height="12" rx="1" fill="${RESISTOR}"/>
        <text x="11.5" y="23.5" text-anchor="middle" font-family="sans-serif"
              font-size="3.5" fill="${LABEL}">103</text>

        <text x="41" y="13" font-family="monospace" font-size="6"
              font-weight="bold" fill="${LABEL}">KY-008</text>

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
      </svg>
    `;
    this.update();
  }
}

if (!customElements.get('velxio-ky-008')) {
  customElements.define('velxio-ky-008', Ky008LaserElement);
}

export { Ky008LaserElement };
