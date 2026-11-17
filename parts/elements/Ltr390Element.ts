/**
 * Ltr390Element.ts — LTR390 UV + ambient light sensor breakout
 * (Adafruit-style board).
 *
 * I2C ALS/UVS sensor at address 0x53. The runtime behavior lives in
 * parts/sim/Ltr390.ts; this element carries the artwork, the
 * pinInfo for the wire system, and the raw ALS / UVS counts the sensor
 * controls / test harness drive.
 *
 * Geometry: real board is 25.4 × 17.8 mm, drawn at ~3.78 px/mm → 96 × 67 px.
 * All 6 through-holes sit on a 0.1" (9.6 px) pitch row at y = 57.
 */

const W = 96;
const H = 67;
const PIN_Y = 57;

const PIN_INFO = [
  { name: 'VIN', x: 24, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: '3Vo', x: 33.6, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'GND', x: 43.2, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'SCL', x: 52.8, y: PIN_Y, number: 4, signals: [] as Array<unknown> },
  { name: 'SDA', x: 62.4, y: PIN_Y, number: 5, signals: [] as Array<unknown> },
  { name: 'INT', x: 72, y: PIN_Y, number: 6, signals: [] as Array<unknown> },
];

class Ltr390Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  /** Raw 20-bit ambient-light count — driven by SensorControlPanel / harness `set` rows. */
  als = 45000;
  /** Raw 20-bit UV count — driven by SensorControlPanel / harness `set` rows. */
  uvs = 1200;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/ltr390.svg" x="0" y="0" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-ltr390')) {
  customElements.define('velxio-ltr390', Ltr390Element);
}
