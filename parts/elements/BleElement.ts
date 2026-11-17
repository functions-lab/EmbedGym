/**
 * BleElement.ts — the Bluetooth LE air an nRF52840 shares with the devices a
 * task describes (a phone, a sensor tag, a beacon).
 *
 * The part has no pins and no wires: placing it on the canvas is what switches
 * the board's emulated BLE radio on (useSimulatorStore.startBoard).
 *
 * Geometry (CSS px, canvas 88 × 70): the Bluetooth rune in a disc centred on
 * (44, 30), radio arcs either side, label below.
 */

const W = 88;
const H = 70;

const BODY = '#22324a';
const BODY_EDGE = '#11181f';
const DISC = '#0a84ff';
const RUNE = '#ffffff';
const SIGNAL = '#5ab4ff';
const LABEL = '#e5e7eb';

class BleElement extends HTMLElement {
  readonly pinInfo = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="84" height="66" rx="10" fill="${BODY}" stroke="${BODY_EDGE}" stroke-width="1.5"/>

        <g fill="none" stroke="${SIGNAL}" stroke-width="2.5" stroke-linecap="round">
          <path d="M 25.98 42.62 A 22 22 0 0 1 25.98 17.38"/>
          <path d="M 21.06 46.06 A 28 28 0 0 1 21.06 13.94"/>
          <path d="M 62.02 17.38 A 22 22 0 0 1 62.02 42.62"/>
          <path d="M 66.94 13.94 A 28 28 0 0 1 66.94 46.06"/>
        </g>
        <circle cx="44" cy="30" r="17" fill="${DISC}"/>
        <polyline points="38.5,24.5 49.5,35.5 44,41 44,19 49.5,24.5 38.5,35.5" fill="none"
                  stroke="${RUNE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="44" y="62" text-anchor="middle" font-family="sans-serif"
              font-size="9" font-weight="bold" fill="${LABEL}">BLE</text>
      </svg>`;
  }
}

if (!customElements.get('velxio-ble')) {
  customElements.define('velxio-ble', BleElement);
}
