/**
 * Mq2Element.ts — MQ-2 gas sensor module (top-down, 40 × 20.4 mm board).
 *
 * Geometry (CSS px, 96 dpi, canvas 176 × 77): the board spans x 0–151.2; the
 * four right-angle header pins stick out to the right edge, 9.6 px apart, in
 * the board's order DO / AO / GND / VCC from the top.
 *
 * `detected` mirrors the comparator (DO LOW) and lights the DAT LED.
 */

const W = 176;
const H = 77;

const LED_OFF = '#f4f1e6';
const LED_ON = '#ff3b30';

const PIN_INFO = [
  { name: 'DO', x: 176, y: 24.1, number: 1, signals: [] as Array<unknown> },
  { name: 'AO', x: 176, y: 33.7, number: 2, signals: [] as Array<unknown> },
  { name: 'GND', x: 176, y: 43.3, number: 3, signals: [{ type: 'power', signal: 'GND' }] },
  { name: 'VCC', x: 176, y: 52.9, number: 4, signals: [{ type: 'power', signal: 'VCC' }] },
];

class Mq2Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _detected = false;

  get detected() {
    return this._detected;
  }

  set detected(value: boolean) {
    if (value === this._detected) return;
    this._detected = value;
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
    const led = this.shadowRoot?.querySelector('#led-dat');
    if (led) led.setAttribute('fill', this._detected ? LED_ON : LED_OFF);
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="mq2-mesh" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45 44.6 38.5)">
            <path d="M0 0.4H1.6M0.4 0V1.6" stroke="#767d84" stroke-width="0.45"/>
          </pattern>
        </defs>
        <path d="M1.6 0.4H149.6A1.2 1.2 0 0 1 150.8 1.6V75.4A1.2 1.2 0 0 1 149.6 76.6H1.6A1.2 1.2 0 0 1 0.4 75.4V1.6A1.2 1.2 0 0 1 1.6 0.4Z
                 M12.9 9.2A3.3 3.3 0 1 0 6.3 9.2A3.3 3.3 0 1 0 12.9 9.2Z
                 M145.3 9.2A3.3 3.3 0 1 0 138.7 9.2A3.3 3.3 0 1 0 145.3 9.2Z
                 M12.9 67.8A3.3 3.3 0 1 0 6.3 67.8A3.3 3.3 0 1 0 12.9 67.8Z
                 M145.3 67.8A3.3 3.3 0 1 0 138.7 67.8A3.3 3.3 0 1 0 145.3 67.8Z"
              fill="#1f3d9e" fill-rule="evenodd" stroke="#14296e" stroke-width="0.8"/>
        <g fill="none" stroke="#dfe2e6" stroke-width="1.4">
          <circle cx="9.6" cy="9.2" r="4"/><circle cx="142" cy="9.2" r="4"/>
          <circle cx="9.6" cy="67.8" r="4"/><circle cx="142" cy="67.8" r="4"/>
        </g>

        <circle cx="44.6" cy="38.5" r="37.6" fill="#c9cdd1" stroke="#7d848b" stroke-width="0.8"/>
        <circle cx="44.6" cy="38.5" r="33.6" fill="none" stroke="#8d949a" stroke-width="0.8"/>
        <circle cx="44.6" cy="38.5" r="32.4" fill="#b7bcc1" stroke="#7d848b" stroke-width="0.6"/>
        <circle cx="44.6" cy="38.5" r="29.2" fill="#9ba1a7" stroke="#6c737a" stroke-width="0.7"/>
        <circle cx="44.6" cy="38.5" r="29.2" fill="url(#mq2-mesh)"/>

        <g fill="#f2f4f8" font-family="Arial, Helvetica, sans-serif" font-weight="bold">
          <text x="91" y="18.6" font-size="6.2" text-anchor="middle">MQ-2</text>
          <text x="102" y="71.6" font-size="7.4" text-anchor="middle">Gas Sensor</text>
          <g font-size="4.3" font-weight="normal" text-anchor="end">
            <text x="111.6" y="18.4">DAT</text>
            <text x="111.6" y="63">PWR</text>
          </g>
          <g font-size="5.2" text-anchor="end">
            <text x="132.6" y="26">DO</text>
            <text x="132.6" y="35.6">AO</text>
            <text x="132.6" y="45.2">GND</text>
            <text x="132.6" y="54.8">VCC</text>
          </g>
        </g>

        <g fill="none" stroke="#f2f4f8" stroke-width="0.7">
          <rect x="113.4" y="12.6" width="16" height="6.6" rx="0.6"/>
          <rect x="113.4" y="57.6" width="16" height="6.6" rx="0.6"/>
          <path d="M151 19.1H136A2.2 2.2 0 0 0 133.8 21.3V55.5A2.2 2.2 0 0 0 136 57.7H151M133.8 48.1H141.3"/>
        </g>
        <g fill="#c8cacd">
          <rect x="116.6" y="14.2" width="2.2" height="3.4"/><rect x="124" y="14.2" width="2.2" height="3.4"/>
          <rect x="116.6" y="59.2" width="2.2" height="3.4"/><rect x="124" y="59.2" width="2.2" height="3.4"/>
        </g>
        <rect id="led-dat" x="118.8" y="14.2" width="5.2" height="3.4" fill="${LED_OFF}"/>
        <rect id="led-pwr" x="118.8" y="59.2" width="5.2" height="3.4" fill="#f4f1e6"/>

        <g fill="#d6d9dc" stroke="#9aa0a6" stroke-width="0.4">
          <circle cx="138.8" cy="24.1" r="2.6"/><circle cx="138.8" cy="33.7" r="2.6"/>
          <circle cx="138.8" cy="43.3" r="2.6"/><circle cx="138.8" cy="52.9" r="2.6"/>
        </g>
        <rect x="141.3" y="19.3" width="9.9" height="38.4" fill="#1c1c1e"/>
        <g stroke="#3a3a3d" stroke-width="0.5">
          <path d="M141.3 28.9H151.2M141.3 38.5H151.2M141.3 48.1H151.2"/>
        </g>
        <g fill="#9aa0a6">
          <circle cx="138.8" cy="24.1" r="1.1"/><circle cx="138.8" cy="33.7" r="1.1"/>
          <circle cx="138.8" cy="43.3" r="1.1"/><circle cx="138.8" cy="52.9" r="1.1"/>
        </g>
        <g stroke="#b9bcbf" stroke-width="2.2">
          <path d="M151.2 24.1H176M151.2 33.7H176M151.2 43.3H176M151.2 52.9H176"/>
        </g>
      </svg>
    `;
    this.update();
  }
}

if (!customElements.get('velxio-mq2')) {
  customElements.define('velxio-mq2', Mq2Element);
}

export { Mq2Element };
