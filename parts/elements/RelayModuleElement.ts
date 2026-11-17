/**
 * RelayModuleElement.ts — single-channel relay breakout module
 *
 * The EmbedGym-Bench relay is a logic-driven module (drive IN HIGH to
 * energize the coil), not a bare coil — the existing `velxio-relay` SPDT
 * coil stays untouched. Pin names here are what circuit wiring and role
 * resolution key off.
 *
 * The `energized` property is the whole state: true = coil driven (IN HIGH,
 * armature thrown to NO, status LED lit), false = idle (armature resting
 * on NC).
 *
 * Geometry (CSS px, canvas 88 × 48, landscape like the real 50 × 26 mm board):
 *   Screw terminals: NO / COM / NC down the left edge, wire entry at x = 0,
 *   y = 14 / 24 / 34.
 *   Relay can: centered, with the SPDT contact schematic on its face.
 *   Logic header: IN / GND / VCC down the right edge, tips at x = 88,
 *   y = 14 / 24 / 34. Power LED (always on) above it, status LED below it.
 */

const W = 88;
const H = 48;

const BOARD = '#1d4ed8';
const BOARD_EDGE = '#172f8a';
const TERMINAL = '#3b82f6';
const TERMINAL_EDGE = '#1e40af';
const SCREW = '#cbd5e1';
const SCREW_SLOT = '#64748b';
const RELAY_BODY = '#1e3a8a';
const RELAY_EDGE = '#0f1f5c';
const ARMATURE = '#e5e7eb';
const CONTACT = '#9ca3af';
const LED_POWER = '#ff4444';
const LED_OFF = '#14401a';
const LED_ON = '#4ade80';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_INFO = [
  { name: 'NO', x: 0, y: 14, number: 1, signals: [] as Array<unknown> },
  { name: 'COM', x: 0, y: 24, number: 2, signals: [] as Array<unknown> },
  { name: 'NC', x: 0, y: 34, number: 3, signals: [] as Array<unknown> },
  { name: 'IN', x: W, y: 14, number: 4, signals: [] as Array<unknown> },
  { name: 'GND', x: W, y: 24, number: 5, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'VCC', x: W, y: 34, number: 6, signals: [{ type: 'power', signal: 'VCC' }] },
];

class RelayModuleElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _energized = false;

  static get observedAttributes() {
    return ['energized'];
  }

  get energized() {
    return this._energized;
  }

  set energized(value: boolean) {
    const next = value === true || (value as unknown) === 'true';
    if (next === this._energized) return;
    this._energized = next;
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
    if (name === 'energized') this.energized = value !== null && value !== 'false';
  }

  private update() {
    const root = this.shadowRoot;
    if (!root) return;
    const armature = root.querySelector('#armature') as SVGLineElement | null;
    const led = root.querySelector('#status-led') as SVGCircleElement | null;
    // Pivot at COM (45, 34); rest on NC (52, 22), throw to NO (38, 22).
    if (armature) armature.setAttribute('x2', this._energized ? '39' : '51');
    if (led) led.setAttribute('fill', this._energized ? LED_ON : LED_OFF);
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Screw terminal block: three wire entries on the left edge. -->
        <rect x="1" y="7" width="15" height="34" rx="1.5"
              fill="${TERMINAL}" stroke="${TERMINAL_EDGE}" stroke-width="1"/>
        <rect x="0" y="12" width="4" height="4" fill="${HEADER}"/>
        <rect x="0" y="22" width="4" height="4" fill="${HEADER}"/>
        <rect x="0" y="32" width="4" height="4" fill="${HEADER}"/>
        <circle cx="10" cy="14" r="3.2" fill="${SCREW}"/>
        <circle cx="10" cy="24" r="3.2" fill="${SCREW}"/>
        <circle cx="10" cy="34" r="3.2" fill="${SCREW}"/>
        <line x1="7.5" y1="14" x2="12.5" y2="14" stroke="${SCREW_SLOT}" stroke-width="1"/>
        <line x1="7.5" y1="24" x2="12.5" y2="24" stroke="${SCREW_SLOT}" stroke-width="1"/>
        <line x1="7.5" y1="34" x2="12.5" y2="34" stroke="${SCREW_SLOT}" stroke-width="1"/>
        <text x="17" y="16" font-family="sans-serif" font-size="5" fill="${LABEL}">NO</text>
        <text x="17" y="26" font-family="sans-serif" font-size="5" fill="${LABEL}">COM</text>
        <text x="17" y="36" font-family="sans-serif" font-size="5" fill="${LABEL}">NC</text>

        <!-- Relay can with the SPDT contact schematic on its face. -->
        <rect x="32" y="7" width="26" height="34" rx="2"
              fill="${RELAY_BODY}" stroke="${RELAY_EDGE}" stroke-width="1.2"/>
        <text x="45" y="15" text-anchor="middle" font-family="monospace"
              font-size="5" font-weight="bold" fill="${LABEL}">5VDC</text>
        <circle cx="38" cy="22" r="1.8" fill="${CONTACT}"/>
        <circle cx="52" cy="22" r="1.8" fill="${CONTACT}"/>
        <circle cx="45" cy="34" r="1.8" fill="${CONTACT}"/>
        <line id="armature" x1="45" y1="34" x2="51" y2="22"
              stroke="${ARMATURE}" stroke-width="1.8" stroke-linecap="round"/>

        <!-- Logic header on the right edge, power LED above, status LED below. -->
        <circle cx="66" cy="6.5" r="2.5" fill="${LED_POWER}" stroke="${BOARD_EDGE}" stroke-width="0.6"/>
        <circle id="status-led" cx="66" cy="41.5" r="2.5" fill="${LED_OFF}" stroke="${BOARD_EDGE}" stroke-width="0.6"/>
        <text x="76" y="16" text-anchor="end" font-family="sans-serif" font-size="5" fill="${LABEL}">IN</text>
        <text x="76" y="26" text-anchor="end" font-family="sans-serif" font-size="5" fill="${LABEL}">GND</text>
        <text x="76" y="36" text-anchor="end" font-family="sans-serif" font-size="5" fill="${LABEL}">VCC</text>
        <rect x="78" y="9" width="6" height="30" fill="${HEADER}"/>
        <line x1="80" y1="14" x2="${W}" y2="14" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="80" y1="24" x2="${W}" y2="24" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <line x1="80" y1="34" x2="${W}" y2="34" stroke="${PIN_METAL}" stroke-width="2.5"/>
      </svg>
    `;
    this.update();
  }
}

if (!customElements.get('velxio-relay-module')) {
  customElements.define('velxio-relay-module', RelayModuleElement);
}

export { RelayModuleElement };
