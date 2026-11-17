/**
 * Bme280Element.ts — BME280 temperature / pressure / humidity sensor breakout
 *
 * Velxio-native module (wokwi-elements has none). One element serves both
 * transports: the EmbedGym-Bench I2C task wires SDA/SCL, the SPI task wires
 * SCK/MISO/MOSI/CS — only wired pins matter for role resolution. Pin names
 * are the backlog ruling: VCC GND SCL SDA SCK MISO MOSI CS.
 *
 * Geometry (CSS px, canvas 128 × 72):
 *   Board: rounded rect spanning the full canvas (GY-BME280 purple).
 *   Sensor: small metal can with the vent hole, upper left.
 *   Header: eight pins along the bottom edge at x = 8 + 16·n.
 */

const W = 128;
const H = 72;
const PIN_Y = 72;

const BOARD = '#5b21b6';
const BOARD_EDGE = '#3b0f80';
const CAN = '#c0c0c0';
const CAN_EDGE = '#6f6f6f';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_NAMES = ['VCC', 'GND', 'SCL', 'SDA', 'SCK', 'MISO', 'MOSI', 'CS'];

const PIN_INFO = PIN_NAMES.map((name, i) => ({
  name,
  x: 8 + 16 * i,
  y: PIN_Y,
  number: i + 1,
  signals:
    name === 'VCC'
      ? [{ type: 'power', signal: 'VCC' }]
      : name === 'GND'
        ? [{ type: 'power', signal: 'GND' }]
        : ([] as Array<unknown>),
}));

class Bme280Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    const pins = PIN_INFO.map(
      (p) => `
        <line x1="${p.x}" y1="${H - 10}" x2="${p.x}" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <text x="${p.x}" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">${p.name}</text>`,
    ).join('');
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 10}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Bosch sensor can with the humidity vent hole. -->
        <rect x="14" y="14" width="18" height="18" rx="2"
              fill="${CAN}" stroke="${CAN_EDGE}" stroke-width="1.2"/>
        <circle cx="27" cy="19" r="1.8" fill="${CAN_EDGE}"/>

        <text x="76" y="26" text-anchor="middle" font-family="monospace"
              font-size="9" font-weight="bold" fill="${LABEL}">BME280</text>

        <!-- Header strip and the eight pins. -->
        <rect x="2" y="${H - 12}" width="${W - 4}" height="7" fill="${HEADER}"/>
        ${pins}
      </svg>`;
  }
}

if (!customElements.get('velxio-bme280')) {
  customElements.define('velxio-bme280', Bme280Element);
}

export { Bme280Element };
