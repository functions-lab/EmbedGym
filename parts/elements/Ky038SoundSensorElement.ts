/**
 * Ky038SoundSensorElement.ts — KY-038 microphone sound sensor module
 *
 * wokwi-elements' big/small sound sensors carry their own pin naming and
 * never drive D0 from a threshold, so this is a Velxio-native module under
 * its own metadata id (ruling: pins A0/D0, matching the skill doc, not the
 * task's original analog/digital). The pin names here are what circuit wiring
 * and role resolution key off.
 *
 * The `detected` property mirrors D0: true = sound level above threshold.
 *
 * Geometry (CSS px, canvas 72 × 60):
 *   Board: rounded rect spanning the full canvas.
 *   Mic capsule: circle on the left; trim pot square on the right.
 *   Header: four pins along the bottom edge at x = 12 / 28 / 44 / 60, in the
 *   board's own order A0 / GND / VCC / D0.
 */

const W = 72;
const H = 60;
const PIN_Y = 60;

const BOARD = '#1e5b2f';
const BOARD_EDGE = '#0d3b1c';
const MIC_BODY = '#9ca3af';
const MIC_EDGE = '#4b5563';
const POT = '#2563eb';
const POT_EDGE = '#1e3a8a';
const LED_OFF = '#4a1414';
const LED_ON = '#ff4444';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_INFO = [
  { name: 'A0', x: 12, y: PIN_Y, number: 1, signals: [] as Array<unknown> },
  { name: 'GND', x: 28, y: PIN_Y, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'VCC', x: 44, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'D0', x: 60, y: PIN_Y, number: 4, signals: [] as Array<unknown> },
];

class Ky038SoundSensorElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _detected = false;

  static get observedAttributes() {
    return ['detected'];
  }

  get detected() {
    return this._detected;
  }

  set detected(value: boolean) {
    const next = value === true || (value as unknown) === 'true';
    if (next === this._detected) return;
    this._detected = next;
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
    if (name === 'detected') this.detected = value !== null && value !== 'false';
  }

  private update() {
    const root = this.shadowRoot;
    if (!root) return;
    const led = root.querySelector('#led') as SVGCircleElement | null;
    if (led) led.setAttribute('fill', this._detected ? LED_ON : LED_OFF);
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

        <!-- Condenser mic capsule with sound-hole. -->
        <circle cx="20" cy="26" r="10" fill="${MIC_BODY}" stroke="${MIC_EDGE}" stroke-width="1.2"/>
        <circle cx="20" cy="26" r="3" fill="${MIC_EDGE}"/>

        <!-- Sensitivity trim pot. -->
        <rect x="42" y="18" width="16" height="16" rx="2"
              fill="${POT}" stroke="${POT_EDGE}" stroke-width="1.2"/>
        <line x1="50" y1="21" x2="50" y2="31" stroke="${LABEL}" stroke-width="1.6"/>

        <circle id="led" cx="65" cy="10" r="3.5" fill="${LED_OFF}" stroke="${BOARD_EDGE}" stroke-width="0.8"/>
        <text x="10" y="13" font-family="monospace" font-size="7"
              font-weight="bold" fill="${LABEL}">KY-038</text>

        <!-- Header strip and the four pins. -->
        <rect x="4" y="${H - 12}" width="64" height="7" fill="${HEADER}"/>
        <line x1="12" y1="${H - 10}" x2="12" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="28" y1="${H - 10}" x2="28" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="44" y1="${H - 10}" x2="44" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="60" y1="${H - 10}" x2="60" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <text x="12" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">A0</text>
        <text x="28" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">GND</text>
        <text x="44" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">VCC</text>
        <text x="60" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">D0</text>
      </svg>
    `;
    this.update();
  }
}

if (!customElements.get('velxio-ky-038-sound-sensor')) {
  customElements.define('velxio-ky-038-sound-sensor', Ky038SoundSensorElement);
}

export { Ky038SoundSensorElement };
