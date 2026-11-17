/**
 * Ky018PhotoresistorElement.ts — KY-018 photoresistor light sensor module
 *
 * wokwi-elements ships a `wokwi-photoresistor-sensor` whose header is
 * VCC/GND/DO/AO, which doesn't match the EmbedGym-Bench pinout (S/VCC/GND), so this is a Velxio-native module under its own
 * metadata id. The pin names here are what circuit wiring and role resolution
 * key off.
 *
 * Artwork: /component-svgs/ky-018.svg (548 × 618 units), scaled so the
 * 95.3-unit header pitch is 2.54 mm at 96 dpi. Pin tips are the lead ends.
 */

const SCALE = 9.6 / 95.3;
const W = 548 * SCALE;
const H = 618 * SCALE;
const PIN_Y = 617.4 * SCALE;

const PIN_INFO = [
  { name: 'S', x: 188.3 * SCALE, y: PIN_Y, number: 1, signals: [] as Array<unknown> },
  { name: 'VCC', x: 284.2 * SCALE, y: PIN_Y, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'GND', x: 378.9 * SCALE, y: PIN_Y, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
];

class Ky018PhotoresistorElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <image href="/component-svgs/ky-018.svg" width="${W}" height="${H}" />
      </svg>`;
  }
}

if (!customElements.get('velxio-ky-018-photoresistor')) {
  customElements.define('velxio-ky-018-photoresistor', Ky018PhotoresistorElement);
}

export { Ky018PhotoresistorElement };
