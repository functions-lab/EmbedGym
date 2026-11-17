class Mlx90614Element extends HTMLElement {
  readonly pinInfo = [
    { name: 'VIN', x: 7.1, y: 61.6, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 16.7, y: 61.6, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SCL', x: 26.3, y: 61.6, number: 3, signals: [] },
    { name: 'SDA', x: 35.9, y: 61.6, number: 4, signals: [] },
  ];
  objectTemperature = 25;
  ambientTemperature = 25;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="43" height="66" viewBox="0 0 43 66">
        <image href="/component-svgs/mlx90614.svg" width="43" height="66" />
      </svg>`;
  }
}

if (!customElements.get('velxio-mlx90614')) {
  customElements.define('velxio-mlx90614', Mlx90614Element);
}
