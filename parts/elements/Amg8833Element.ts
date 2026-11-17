class Amg8833Element extends HTMLElement {
  readonly pinInfo = [
    { name: 'VIN', x: 24, y: 86.4, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: '3Vo', x: 33.6, y: 86.4, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 43.2, y: 86.4, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SCL', x: 52.8, y: 86.4, number: 4, signals: [] },
    { name: 'SDA', x: 62.4, y: 86.4, number: 5, signals: [] },
    { name: 'INT', x: 72, y: 86.4, number: 6, signals: [] },
  ];
  address = '0x69';
  thermistorTemperature = 25;
  pixelAdcOverflow = false;

  constructor() {
    super();
    for (let i = 0; i < 64; i++) Object.assign(this, { [`pixel${i}`]: 25 });
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <image href="/component-svgs/amg8833.svg" width="96" height="96" />
      </svg>`;
  }
}

if (!customElements.get('velxio-amg8833')) {
  customElements.define('velxio-amg8833', Amg8833Element);
}
