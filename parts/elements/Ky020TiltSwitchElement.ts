/**
 * Ky020TiltSwitchElement.ts — KY-020 tilt switch module
 *
 * wokwi-elements ships a bare `wokwi-tilt-switch` (GND/VCC/OUT), but the
 * EmbedGym-Bench KY-020 is a 3-pin breakout whose header is silkscreened
 * S / V / G — those are the names circuit wiring and role resolution key off.
 *
 * The `tilted` property is the whole state: true = ball settled across the
 * contacts (switch closed, S driven HIGH), false = upright (S LOW).
 *
 * Geometry (CSS px, canvas 64 × 60):
 *   Board: rounded rect spanning the full canvas.
 *   Tilt capsule: rotates 20° when tilted so the state is visible.
 *   Header: three pins along the bottom edge at x = 16 / 32 / 48.
 */

const W = 64;
const H = 60;
const PIN_Y = 60;

const BOARD = '#1e5b2f';
const BOARD_EDGE = '#0d3b1c';
const CAPSULE = '#1e88e5';
const CAPSULE_EDGE = '#90caf9';
const BALL = '#e0e0e0';
const RESISTOR = '#2b2b2b';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_INFO = [
  { name: 'S', x: 16, y: PIN_Y, number: 1, signals: [] as Array<unknown> },
  { name: 'V', x: 32, y: PIN_Y, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'G', x: 48, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
];

class Ky020TiltSwitchElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _tilted = false;

  static get observedAttributes() {
    return ['tilted'];
  }

  get tilted() {
    return this._tilted;
  }

  set tilted(value: boolean) {
    const next = value === true || (value as unknown) === 'true';
    if (next === this._tilted) return;
    this._tilted = next;
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
    if (name === 'tilted') this.tilted = value !== null && value !== 'false';
  }

  private update() {
    const root = this.shadowRoot;
    if (!root) return;
    const capsule = root.querySelector('#capsule') as SVGGElement | null;
    if (capsule) capsule.setAttribute('transform', this._tilted ? 'rotate(20 32 26)' : '');
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
        #capsule { transition: transform 120ms ease-out; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 10}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Tilt capsule: the blue can with its rolling ball. -->
        <g id="capsule">
          <rect x="18" y="18" width="28" height="16" rx="8"
                fill="${CAPSULE}" stroke="${CAPSULE_EDGE}" stroke-width="1.2"/>
          <circle cx="26" cy="26" r="4" fill="${BALL}"/>
        </g>

        <!-- 10k SMD resistor. -->
        <rect x="50" y="20" width="7" height="12" rx="1" fill="${RESISTOR}"/>
        <text x="53.5" y="27.5" text-anchor="middle" font-family="sans-serif"
              font-size="3.5" fill="${LABEL}">103</text>
        <text x="10" y="13" font-family="monospace" font-size="7"
              font-weight="bold" fill="${LABEL}">KY-020</text>

        <!-- Header strip and the three pins. -->
        <rect x="6" y="${H - 12}" width="52" height="7" fill="${HEADER}"/>
        <line x1="16" y1="${H - 10}" x2="16" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="32" y1="${H - 10}" x2="32" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="48" y1="${H - 10}" x2="48" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <text x="16" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">S</text>
        <text x="32" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">V</text>
        <text x="48" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="6" fill="${LABEL}">G</text>
      </svg>
    `;
    this.update();
  }
}

if (!customElements.get('velxio-ky-020-tilt-switch')) {
  customElements.define('velxio-ky-020-tilt-switch', Ky020TiltSwitchElement);
}

export { Ky020TiltSwitchElement };
