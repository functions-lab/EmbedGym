/**
 * Pmsa003iElement.ts — PMSA003I PM2.5 air quality sensor breakout
 * (Adafruit-style board, Plantower PMSA003I module).
 *
 * I2C particulate-matter sensor at fixed address 0x12. The runtime behavior
 * lives in parts/sim/Pmsa003i.ts; this element carries the
 * artwork, the pinInfo for the wire system, and the PM concentration state
 * the sensor controls / test harness drive.
 *
 * Geometry: real board is 38 × 44 mm, drawn at ~3.78 px/mm → 144 × 166 px.
 * All 7 through-holes sit on a 0.1" (9.6 px) pitch row at y = 155.
 */

const W = 144;
const H = 166;
const PIN_Y = 155;

const PIN_INFO = [
  { name: 'VIN', x: 43.2, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: '3Vo', x: 52.8, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'GND', x: 62.4, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'SCL', x: 72, y: PIN_Y, number: 4, signals: [] as Array<unknown> },
  { name: 'SDA', x: 81.6, y: PIN_Y, number: 5, signals: [] as Array<unknown> },
  { name: 'RST', x: 91.2, y: PIN_Y, number: 6, signals: [] as Array<unknown> },
  { name: 'SET', x: 100.8, y: PIN_Y, number: 7, signals: [] as Array<unknown> },
];

class Pmsa003iElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  /** PM concentrations in µg/m³ — driven by SensorControlPanel / test-harness `set` rows. */
  pm1_0 = 8;
  pm2_5 = 12;
  pm10 = 20;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/pmsa003i.svg" x="0" y="0" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-pmsa003i')) {
  customElements.define('velxio-pmsa003i', Pmsa003iElement);
}
