/**
 * Pa1616sElement.ts — PA1616S GPS module (Adafruit Ultimate GPS Breakout v3)
 *
 * UART GPS receiver built around the MTK3339 chipset. Streams NMEA sentences
 * at 9600 baud; on an Arduino Mega it wires to Serial1 (TX → D19/RX1,
 * RX → D18/TX1). The runtime behavior lives in simulation/parts/GpsParts.ts;
 * this element carries the artwork, the pinInfo for the wire system, and the
 * GPS state the sensor controls / test harness drive.
 *
 * Geometry: real board is 25.5 × 35 mm, drawn at ~3.78 px/mm → 96 × 132 px.
 * All 9 through-holes sit on a 0.1" (9.6 px) pitch row at y = 121.
 */

const W = 96;
const H = 132;
const PIN_Y = 121;

const PIN_INFO = [
  { name: '3.3V', x: 9.6, y: PIN_Y, number: 1, signals: [] as Array<unknown> },
  { name: 'EN', x: 19.2, y: PIN_Y, number: 2, signals: [] as Array<unknown> },
  { name: 'VBAT', x: 28.8, y: PIN_Y, number: 3, signals: [] as Array<unknown> },
  { name: 'FIX', x: 38.4, y: PIN_Y, number: 4, signals: [] as Array<unknown> },
  { name: 'TX', x: 48, y: PIN_Y, number: 5, signals: [] as Array<unknown> },
  { name: 'RX', x: 57.6, y: PIN_Y, number: 6, signals: [] as Array<unknown> },
  { name: 'GND', x: 67.2, y: PIN_Y, number: 7, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'VIN', x: 76.8, y: PIN_Y, number: 8, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'PPS', x: 86.4, y: PIN_Y, number: 9, signals: [] as Array<unknown> },
];

class Pa1616sElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  /** GPS state — driven by SensorControlPanel / test-harness `set` rows. */
  fix = false;
  latitude = 37.7749;
  longitude = -122.4194;
  satellites = 8;
  altitude = 12.5;
  /** Ground speed in knots (what NMEA RMC/VTG carry natively). */
  speed = 0;
  /** Course over ground in degrees true. */
  course = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/pa1616s.svg" x="0" y="0" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-pa1616s')) {
  customElements.define('velxio-pa1616s', Pa1616sElement);
}
