/**
 * Max32664Element.ts — SparkFun Pulse Oximeter and Heart Rate Sensor
 * (MAX30101 optical AFE + MAX32664 biometric sensor hub, Qwiic).
 *
 * I2C device at address 0x55. The hub runs Maxim's heart-rate / SpO2 algorithm
 * and reports finished readings, so this element carries the algorithm outputs
 * the sensor controls and test harness drive. The wire protocol lives in
 * parts/sim/Max32664.ts.
 *
 * Geometry: real board is 25.4 x 12.7 mm, drawn at ~4.72 px/mm -> 120 x 60 px.
 * The physical board tucks MFIO inboard of the RST..GND column; drawing all six
 * pads as one 0.1" (9.6 px) column at x = 112 keeps every label legible and
 * every pin wirable, with MFIO keeping its position above RST.
 */

const W = 120;
const H = 60;
const PIN_X = 112;

const PIN_INFO = [
  { name: 'MFIO', x: PIN_X, y: 6, number: 1, signals: [] as Array<unknown> },
  { name: 'RST', x: PIN_X, y: 15.6, number: 2, signals: [] as Array<unknown> },
  { name: 'SCL', x: PIN_X, y: 25.2, number: 3, signals: [] as Array<unknown> },
  { name: 'SDA', x: PIN_X, y: 34.8, number: 4, signals: [] as Array<unknown> },
  { name: '3V3', x: PIN_X, y: 44.4, number: 5, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'GND', x: PIN_X, y: 54, number: 6, signals: [{ type: 'power', signal: 'GND' }] },
];

class Max32664Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  /** Heart rate in BPM — driven by SensorControlPanel / test-harness `set` rows. */
  heartRate = 72;
  /** Algorithm confidence in the heart-rate value, 0-100 %. */
  confidence = 95;
  /** Blood oxygen saturation, 0-100 %. */
  oxygen = 98;
  /** Finger state: 0 success, 1 not ready, 2 object detected, 3 finger detected. */
  status = 3;
  /** SpO2 correlation coefficient reported in MODE_TWO. */
  rValue = 12.5;
  /** Extended finger status reported in MODE_TWO (signed). */
  extStatus = 0;
  // No irLed/redLed: the MAX30101 LED counts are fixed (LED_COUNTS in
  // parts/sim/Max32664.ts), since the hub algorithm that turns
  // them into the readings above cannot be reproduced.

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/max32664.svg" x="0" y="0" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-max32664')) {
  customElements.define('velxio-max32664', Max32664Element);
}
