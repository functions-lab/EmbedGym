class Hmc5883lElement extends HTMLElement {
  readonly pinInfo = [
    { name: 'VCC', x: 5.8, y: 63.5, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 15.4, y: 63.5, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SCL', x: 25, y: 63.5, number: 3, signals: [] },
    { name: 'SDA', x: 34.6, y: 63.5, number: 4, signals: [] },
    { name: 'DRDY', x: 44.2, y: 63.5, number: 5, signals: [] },
  ];
  magneticX = 0.3;
  magneticY = -0.2;
  magneticZ = 0.1;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="50" height="69" viewBox="0 0 50 69">
        <image href="/component-svgs/hmc5883l.svg" width="50" height="69" />
      </svg>`;
  }
}

if (!customElements.get('velxio-hmc5883l')) {
  customElements.define('velxio-hmc5883l', Hmc5883lElement);
}
