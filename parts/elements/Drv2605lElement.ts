class Drv2605lElement extends HTMLElement {
  readonly pinInfo = [
    { name: 'VIN', x: 28.8, y: 101.6, number: 1, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 38.4, y: 101.6, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SCL', x: 48, y: 101.6, number: 3, signals: [] },
    { name: 'SDA', x: 57.6, y: 101.6, number: 4, signals: [] },
    { name: 'INT', x: 67.2, y: 101.6, number: 5, signals: [] },
  ];
  standby = true;
  mode = 0;
  library = 1;
  go = false;
  drive = 0;
  effectCount = 0;
  lastEffect = 0;
  lastEffectMs = -1;
  effects = '';
  private motorVibrating = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>:host { display: inline-block; line-height: 0; } svg { display: block; }</style>
      <svg width="96" height="111.2" viewBox="0 0 96 111.2">
        <image href="/component-svgs/drv2605l.svg" width="96" height="111.2" />
        <g id="vib" style="display:none" fill="none" stroke="#9ca3af" stroke-width="1.3" stroke-linecap="round">
          <path d="M28.1 31.5A23 23 0 0 1 28.1 8.5"/>
          <path d="M67.9 8.5A23 23 0 0 1 67.9 31.5"/>
          <path d="M24.2 33.8A27.5 27.5 0 0 1 24.2 6.2"/>
          <path d="M71.8 6.3A27.5 27.5 0 0 1 71.8 33.8"/>
        </g>
      </svg>`;
  }

  get vibrating(): boolean {
    return this.motorVibrating;
  }

  set vibrating(on: boolean) {
    this.motorVibrating = on;
    (this.shadowRoot!.getElementById('vib') as unknown as SVGGElement).style.display = on ? '' : 'none';
  }
}

if (!customElements.get('velxio-drv2605l')) {
  customElements.define('velxio-drv2605l', Drv2605lElement);
}
