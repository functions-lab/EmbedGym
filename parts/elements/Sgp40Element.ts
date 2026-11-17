/**
 * Sgp40Element.ts — SGP40 MOX gas (VOC) sensor breakout (Adafruit-style board).
 *
 * I2C VOC sensor at address 0x59. The runtime behavior lives in
 * parts/sim/Sgp40.ts; this element carries the artwork, the
 * pinInfo for the wire system, and the raw SRAW gas signal the sensor
 * controls / test harness drive.
 *
 * Geometry: real board is 25.4 × 17.8 mm, drawn at ~3.78 px/mm → 96 × 67 px.
 * All 5 through-holes sit on a 0.1" (9.6 px) pitch row at y = 57.
 *
 * 3.3V is the board's regulator output. It is wireable so the drawn pad is
 * honest, but nothing reads it — the part is powered through VIN.
 */

const W = 96;
const H = 67;
const PIN_Y = 57;

const PIN_INFO = [
  { name: 'VIN', x: 28.8, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: '3.3V', x: 38.4, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'GND', x: 48, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'SCL', x: 57.6, y: PIN_Y, number: 4, signals: [] as Array<unknown> },
  { name: 'SDA', x: 67.2, y: PIN_Y, number: 5, signals: [] as Array<unknown> },
];

class Sgp40Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  /** Raw 16-bit MOX gas signal (SRAW ticks) — driven by SensorControlPanel / harness `set` rows. */
  raw = 30000;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/sgp40.svg" x="0" y="0" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-sgp40')) {
  customElements.define('velxio-sgp40', Sgp40Element);
}
