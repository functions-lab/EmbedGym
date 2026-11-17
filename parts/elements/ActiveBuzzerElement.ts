/**
 * ActiveBuzzerElement.ts — sealed active buzzer, top-down.
 *
 * Same body and lead positions as wokwi-buzzer (17 × 20 mm, leads 2.54 mm
 * apart), with a sealed top. Pin 1 is positive (signal), pin 2 GND.
 * `sounding` shows the sound arcs, drawn outside the box on both sides.
 */

const PIN_INFO = [
  { name: '1', x: 27, y: 76, number: 1, signals: [] as Array<unknown> },
  { name: '2', x: 37, y: 76, number: 2, signals: [{ type: 'power', signal: 'GND' }] },
];

class ActiveBuzzerElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _sounding = false;

  get sounding() {
    return this._sounding;
  }

  set sounding(value: boolean) {
    if (value === this._sounding) return;
    this._sounding = value;
    this.update();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  private update() {
    const sound = this.shadowRoot?.querySelector('#sound');
    if (sound) sound.setAttribute('visibility', this._sounding ? 'visible' : 'hidden');
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="64" height="76" viewBox="0 0 64 76" xmlns="http://www.w3.org/2000/svg">
        <path d="M27 60v16" fill="none" stroke="#f00" stroke-width="1.9"/>
        <path d="M37 60v16" fill="none" stroke="#000" stroke-width="1.9"/>
        <circle cx="32" cy="32" r="30.8" fill="#1a1a1a" stroke="#000" stroke-width="2.6"/>
        <circle cx="32" cy="32" r="25" fill="#262626" stroke="#0d0d0d" stroke-width="1"/>
        <circle cx="32" cy="32" r="2.6" fill="#000" stroke="#4d4d4d" stroke-width="0.8"/>
        <text x="32" y="22" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
              font-size="7" font-weight="bold" letter-spacing="0.4" fill="#e6e6e6">ACTIVE</text>
        <path d="M27 45.5v7M23.5 49h7" fill="none" stroke="#e6e6e6" stroke-width="1.6"/>
        <g id="sound" visibility="hidden" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round">
          <path d="M66 25a9 9 0 0 1 0 14"/>
          <path d="M70 20a15 15 0 0 1 0 24"/>
          <path d="M-2 25a9 9 0 0 0 0 14"/>
          <path d="M-6 20a15 15 0 0 0 0 24"/>
        </g>
      </svg>
    `;
    this.update();
  }
}

if (!customElements.get('velxio-active-buzzer')) {
  customElements.define('velxio-active-buzzer', ActiveBuzzerElement);
}

export { ActiveBuzzerElement };
