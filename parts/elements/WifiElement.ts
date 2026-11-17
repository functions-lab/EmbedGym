/**
 * WifiElement.ts — the WiFi network an ESP32 joins (a small access point).
 *
 * The part has no pins and no wires: placing it on the canvas is what switches
 * the board's emulated WiFi on (useSimulatorStore.startBoard). It stands for
 * the emulator's fixed AP table, which includes the open network "Espressif".
 *
 * Geometry (CSS px, canvas 88 × 70): two antennas along the back edge, body
 * y 12..68 with the signal-arcs symbol centred on (44, 46).
 */

const W = 88;
const H = 70;

const BODY = '#2f3b48';
const BODY_EDGE = '#1a222b';
const ANTENNA = '#4b5563';
const SIGNAL = '#4fc3f7';
const LABEL = '#e5e7eb';
const STATUS_LED = '#4ade80';

class WifiElement extends HTMLElement {
  readonly pinInfo = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="13" y="0" width="7" height="18" rx="3" fill="${ANTENNA}"/>
        <rect x="68" y="0" width="7" height="18" rx="3" fill="${ANTENNA}"/>
        <rect x="2" y="12" width="84" height="56" rx="8" fill="${BODY}" stroke="${BODY_EDGE}" stroke-width="1.5"/>

        <g fill="none" stroke="${SIGNAL}" stroke-width="3" stroke-linecap="round">
          <path d="M 38.34 40.34 A 8 8 0 0 1 49.66 40.34"/>
          <path d="M 34.10 36.10 A 14 14 0 0 1 53.90 36.10"/>
          <path d="M 29.86 31.86 A 20 20 0 0 1 58.14 31.86"/>
        </g>
        <circle cx="44" cy="46" r="3" fill="${SIGNAL}"/>
        <text x="44" y="62" text-anchor="middle" font-family="sans-serif"
              font-size="9" font-weight="bold" fill="${LABEL}">WiFi</text>

        <circle cx="10" cy="60" r="1.6" fill="${STATUS_LED}"/>
        <circle cx="15" cy="60" r="1.6" fill="${STATUS_LED}"/>
        <circle cx="20" cy="60" r="1.6" fill="${STATUS_LED}"/>
      </svg>`;
  }
}

if (!customElements.get('velxio-wifi')) {
  customElements.define('velxio-wifi', WifiElement);
}
