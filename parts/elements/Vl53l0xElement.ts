/**
 * Vl53l0xElement.ts — VL53L0X time-of-flight distance sensor breakout
 * (Adafruit-style board).
 *
 * I2C laser-ranging sensor at address 0x29, 50–2000 mm range. The runtime
 * behavior lives in parts/sim/Vl53l0x.ts; this element carries
 * the artwork, the pinInfo for the wire system, and the distance state the
 * sensor controls / test harness drive.
 *
 * Geometry: real board is 25.4 × 17.8 mm, drawn at ~3.78 px/mm → 96 × 67 px.
 * All 6 through-holes sit on a 0.1" (9.6 px) pitch row at y = 57.
 */

const W = 96;
const H = 67;
const PIN_Y = 57;

const PIN_INFO = [
  { name: 'VIN', x: 24, y: PIN_Y, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'GND', x: 33.6, y: PIN_Y, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'SCL', x: 43.2, y: PIN_Y, number: 3, signals: [] as Array<unknown> },
  { name: 'SDA', x: 52.8, y: PIN_Y, number: 4, signals: [] as Array<unknown> },
  { name: 'GPIO', x: 62.4, y: PIN_Y, number: 5, signals: [] as Array<unknown> },
  { name: 'XSHUT', x: 72, y: PIN_Y, number: 6, signals: [] as Array<unknown> },
];

class Vl53l0xElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  /** Measured distance in mm — driven by SensorControlPanel / test-harness `set` rows. */
  distance = 100;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/vl53l0x.svg" x="0" y="0" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-vl53l0x')) {
  customElements.define('velxio-vl53l0x', Vl53l0xElement);
}
