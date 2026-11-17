class Max17048Element extends HTMLElement {
  readonly pinInfo = [
    { name: 'VIN', x: 24, y: 67.2, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 33.6, y: 67.2, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SCL', x: 43.2, y: 67.2, number: 3, signals: [] },
    { name: 'SDA', x: 52.8, y: 67.2, number: 4, signals: [] },
    { name: 'INT', x: 62.4, y: 67.2, number: 5, signals: [] },
    { name: 'QStart', x: 72, y: 67.2, number: 6, signals: [] },
    { name: '+', x: 43.2, y: 33.6, number: 7, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: '-', x: 52.8, y: 33.6, number: 8, signals: [{ type: 'power', signal: 'GND' }] },
  ];
  batteryConnected = false;
  cellVoltage = 3.8;
  openCircuitVoltage = 3.8;
  stateOfCharge = 50;
  chargeRate = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="96" height="76.8" viewBox="0 0 96 76.8">
        <image href="/component-svgs/max17048.svg" width="96" height="76.8" />
      </svg>`;
  }
}

if (!customElements.get('velxio-max17048')) {
  customElements.define('velxio-max17048', Max17048Element);
}
