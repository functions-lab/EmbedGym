export class Mpr121Element extends HTMLElement {
  readonly pinInfo = [{"name":"VIN","x":33.6,"y":62.4,"number":1,"signals":[{"type":"power","signal":"VCC"}]},{"name":"3Vo","x":43.2,"y":62.4,"number":2,"signals":[{"type":"power","signal":"VCC"}]},{"name":"GND","x":52.8,"y":62.4,"number":3,"signals":[{"type":"power","signal":"GND"}]},{"name":"SCL","x":62.4,"y":62.4,"number":4,"signals":[]},{"name":"SDA","x":72.0,"y":62.4,"number":5,"signals":[]},{"name":"INT","x":81.6,"y":62.4,"number":6,"signals":[]},{"name":"ADDR","x":91.2,"y":62.4,"number":7,"signals":[]},{"name":"11","x":4.8,"y":4.8,"number":8,"signals":[]},{"name":"10","x":14.4,"y":4.8,"number":9,"signals":[]},{"name":"9","x":24.0,"y":4.8,"number":10,"signals":[]},{"name":"8","x":33.6,"y":4.8,"number":11,"signals":[]},{"name":"7","x":43.2,"y":4.8,"number":12,"signals":[]},{"name":"6","x":52.8,"y":4.8,"number":13,"signals":[]},{"name":"5","x":62.4,"y":4.8,"number":14,"signals":[]},{"name":"4","x":72.0,"y":4.8,"number":15,"signals":[]},{"name":"3","x":81.6,"y":4.8,"number":16,"signals":[]},{"name":"2","x":91.2,"y":4.8,"number":17,"signals":[]},{"name":"1","x":100.8,"y":4.8,"number":18,"signals":[]},{"name":"0","x":110.4,"y":4.8,"number":19,"signals":[]}];
  readonly equivalentPads = [{ name: 'GND', x: 120, y: 4.8 }];
  address: number | string | undefined;
  rextOvercurrent = false;
  readonly pressed = Array<boolean>(12).fill(false);
  [key: string]: unknown;

  constructor() {
    super();
    for (let i = 0; i < 12; i++) this[`capacitance${i}`] = 15;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host { display:inline-block; line-height:0; } svg { display:block; } .key { fill:transparent; cursor:pointer; } .key[aria-pressed="true"] { fill:#64b5f6; fill-opacity:.55; }</style><svg xmlns="http://www.w3.org/2000/svg" width="124.8" height="72.48" viewBox="0 0 124.8 72.48">
  <defs>
    <mask id="mpr121-board-holes">
      <rect width="124.8" height="72.48" fill="white"/>
      <g fill="black">
        <circle cx="9.6" cy="62.4" r="4.72"/><circle cx="115.2" cy="62.4" r="4.72"/>
        <circle cx="4.8" cy="4.8" r="1.89"/><circle cx="14.4" cy="4.8" r="1.89"/>
        <circle cx="24" cy="4.8" r="1.89"/><circle cx="33.6" cy="4.8" r="1.89"/>
        <circle cx="43.2" cy="4.8" r="1.89"/><circle cx="52.8" cy="4.8" r="1.89"/>
        <circle cx="62.4" cy="4.8" r="1.89"/><circle cx="72" cy="4.8" r="1.89"/>
        <circle cx="81.6" cy="4.8" r="1.89"/><circle cx="91.2" cy="4.8" r="1.89"/>
        <circle cx="100.8" cy="4.8" r="1.89"/><circle cx="110.4" cy="4.8" r="1.89"/>
        <circle cx="120" cy="4.8" r="1.89"/>
        <circle cx="33.6" cy="62.4" r="1.89"/><circle cx="43.2" cy="62.4" r="1.89"/>
        <circle cx="52.8" cy="62.4" r="1.89"/><circle cx="62.4" cy="62.4" r="1.89"/>
        <circle cx="72" cy="62.4" r="1.89"/><circle cx="81.6" cy="62.4" r="1.89"/>
        <circle cx="91.2" cy="62.4" r="1.89"/>
      </g>
    </mask>
  </defs>
  <g mask="url(#mpr121-board-holes)">
    <path d="M0.5 0.5H124.3V62.88A9.1 9.1 0 0 1 115.2 71.98H9.6A9.1 9.1 0 0 1 0.5 62.88Z" fill="#282a2b" stroke="#a6a6a0" stroke-width="1"/>
    <g fill="#d9c18a" stroke="#e6e2d7" stroke-width="0.8">
      <circle cx="9.6" cy="62.4" r="6.7"/><circle cx="115.2" cy="62.4" r="6.7"/>
    </g>
    <g fill="#d9bc7c" stroke="#ddd8c8" stroke-width="0.4">
      <circle cx="4.8" cy="4.8" r="3.168"/><circle cx="14.4" cy="4.8" r="3.168"/>
      <circle cx="24" cy="4.8" r="3.168"/><circle cx="33.6" cy="4.8" r="3.168"/>
      <circle cx="43.2" cy="4.8" r="3.168"/><circle cx="52.8" cy="4.8" r="3.168"/>
      <circle cx="62.4" cy="4.8" r="3.168"/><circle cx="72" cy="4.8" r="3.168"/>
      <circle cx="81.6" cy="4.8" r="3.168"/><circle cx="91.2" cy="4.8" r="3.168"/>
      <circle cx="100.8" cy="4.8" r="3.168"/><circle cx="110.4" cy="4.8" r="3.168"/>
      <circle cx="120" cy="4.8" r="3.168"/>
      <circle cx="33.6" cy="62.4" r="3.36"/><circle cx="43.2" cy="62.4" r="3.36"/>
      <circle cx="52.8" cy="62.4" r="3.36"/><circle cx="62.4" cy="62.4" r="3.36"/>
      <circle cx="72" cy="62.4" r="3.36"/><circle cx="81.6" cy="62.4" r="3.36"/>
      <circle cx="91.2" cy="62.4" r="3.36"/>
    </g>
  </g>
  <g font-family="Arial, sans-serif" fill="#eeeae2" text-anchor="middle">
    <g font-size="4.3">
      <text x="4.8" y="13.1">11</text><text x="14.4" y="13.1">10</text>
      <text x="24" y="13.1">9</text><text x="33.6" y="13.1">8</text>
      <text x="43.2" y="13.1">7</text><text x="52.8" y="13.1">6</text>
      <text x="62.4" y="13.1">5</text><text x="72" y="13.1">4</text>
      <text x="81.6" y="13.1">3</text><text x="91.2" y="13.1">2</text>
      <text x="100.8" y="13.1">1</text><text x="110.4" y="13.1">0</text>
      <text x="120" y="16.6" transform="rotate(-90 120 16.6)">GND</text>
      <text x="33.6" y="70.4">VIN</text><text x="43.2" y="58.1">3Vo</text>
      <text x="52.8" y="70.4">GND</text><text x="62.4" y="58.1">SCL</text>
      <text x="72" y="70.4">SDA</text><text x="81.6" y="58.1">INT</text>
      <text x="91.2" y="70.4">ADDR</text>
    </g>
    <text x="62.4" y="20.4" font-size="5.8">12 Capacitive Touch Sensors</text>
    <text x="62.4" y="27.1" font-size="5.8">MPR121</text>
    <text x="4.7" y="21.5" font-size="4.3">on</text>
  </g>
  <g fill="#c9caca">
    <rect x="14" y="32" width="4.5" height="1.5"/><rect x="14" y="35.8" width="4.5" height="1.5"/>
    <rect x="14" y="39.6" width="4.5" height="1.5"/><rect x="14" y="43.4" width="4.5" height="1.5"/>
    <rect x="106.3" y="32" width="4.5" height="1.5"/><rect x="106.3" y="35.8" width="4.5" height="1.5"/>
    <rect x="106.3" y="39.6" width="4.5" height="1.5"/><rect x="106.3" y="43.4" width="4.5" height="1.5"/>
  </g>
  <rect x="0.8" y="27" width="14.8" height="22.8" rx="0.8" fill="#e9e4d3" stroke="#c5c0b1" stroke-width="0.6"/>
  <rect x="109.2" y="27" width="14.8" height="22.8" rx="0.8" fill="#e9e4d3" stroke="#c5c0b1" stroke-width="0.6"/>
  <g fill="#c8c9c5">
    <rect x="57.8" y="29.1" width="1.3" height="14.8"/><rect x="59.7" y="29.1" width="1.3" height="14.8"/>
    <rect x="61.8" y="29.1" width="1.3" height="14.8"/><rect x="63.8" y="29.1" width="1.3" height="14.8"/>
    <rect x="65.8" y="29.1" width="1.3" height="14.8"/>
    <rect x="55" y="31.9" width="14.8" height="1.3"/><rect x="55" y="33.8" width="14.8" height="1.3"/>
    <rect x="55" y="35.9" width="14.8" height="1.3"/><rect x="55" y="37.9" width="14.8" height="1.3"/>
    <rect x="55" y="39.9" width="14.8" height="1.3"/>
  </g>
  <rect x="56.73" y="30.81" width="11.34" height="11.34" fill="#414444" stroke="#171a19" stroke-width="0.6"/>
  <circle cx="58.2" cy="32.2" r="0.55" fill="#999e9c"/>
  <text x="62.4" y="37.4" font-family="Arial, sans-serif" font-size="2.6" fill="#bbc0bd" text-anchor="middle">M121</text>
  <g stroke="#c8c9c5" stroke-width="0.6">
    <rect x="21.8" y="51" width="9.2" height="4.4" fill="#c5a47b"/>
    <rect x="25.2" y="30.4" width="9.2" height="4.4" fill="#c5a47b"/>
    <rect x="43.5" y="39.9" width="7" height="3.4" fill="#c5a47b"/>
    <rect x="72.6" y="44.6" width="7" height="3.4" fill="#c5a47b"/>
    <rect x="72.6" y="50.6" width="7" height="3.4" fill="#414444"/>
    <rect x="72.6" y="37.7" width="7" height="3.4" fill="#414444"/>
    <rect x="47.5" y="49.7" width="7" height="3.4" fill="#414444"/>
    <rect x="85.4" y="34.7" width="3.4" height="7" fill="#414444"/>
    <rect x="20.9" y="25.2" width="7" height="3.4" fill="#414444"/>
    <rect x="87.4" y="25.6" width="7" height="3.4" fill="#c5a47b"/>
  </g>
  <g fill="#c8c9c5">
    <rect x="21.8" y="51" width="1.4" height="4.4"/><rect x="29.6" y="51" width="1.4" height="4.4"/>
    <rect x="25.2" y="30.4" width="1.4" height="4.4"/><rect x="33" y="30.4" width="1.4" height="4.4"/>
    <rect x="43.5" y="39.9" width="1.2" height="3.4"/><rect x="49.3" y="39.9" width="1.2" height="3.4"/>
    <rect x="72.6" y="44.6" width="1.2" height="3.4"/><rect x="78.4" y="44.6" width="1.2" height="3.4"/>
    <rect x="29.7" y="40" width="5.9" height="1.3"/><rect x="29.7" y="44" width="5.9" height="1.3"/>
    <rect x="90.5" y="29" width="1.3" height="8.6"/><rect x="94.5" y="29" width="1.3" height="8.6"/>
    <rect x="90.5" y="48.1" width="1.3" height="8.6"/><rect x="94.5" y="48.1" width="1.3" height="8.6"/>
  </g>
  <rect x="28.9" y="41.3" width="7.4" height="4" fill="#414444" stroke="#171a19" stroke-width="0.5"/>
  <rect x="88.9" y="31" width="8.6" height="4.5" fill="#414444" stroke="#171a19" stroke-width="0.5"/>
  <rect x="88.9" y="50.1" width="8.6" height="4.5" fill="#414444" stroke="#171a19" stroke-width="0.5"/>
  <rect x="4.6" y="23" width="3" height="1.9" rx="0.2" fill="#6f9361" stroke="#c8c9c5" stroke-width="0.5"/>
  <rect x="83.9" y="46.8" width="3" height="1.9" rx="0.2" transform="rotate(90 85.4 47.75)" fill="#779786" stroke="#c8c9c5" stroke-width="0.5"/>
</svg>
`;
    const svg = root.querySelector('svg')!;
    for (let i = 0; i < 12; i++) {
      const button = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      button.setAttribute('x', String(105.6 - i * 9.6));
      button.setAttribute('y', '0'); button.setAttribute('width', '9.6'); button.setAttribute('height', '22');
      button.setAttribute('class', 'key'); button.setAttribute('role', 'button'); button.setAttribute('tabindex', '0');
      button.setAttribute('aria-label', `Electrode ${i}`); button.setAttribute('aria-pressed', 'false');
      button.dataset.key = String(i);
      button.addEventListener('pointerdown', (event) => { event.preventDefault(); if (!this.pressed[i]) this.down(String(i)); });
      button.addEventListener('pointerup', () => { if (this.pressed[i]) this.up(String(i)); });
      button.addEventListener('pointerleave', () => { if (this.pressed[i]) this.up(String(i)); });
      button.addEventListener('keydown', (event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); if (!this.pressed[i]) this.down(String(i)); }
      });
      button.addEventListener('keyup', (event) => { if ((event.key === ' ' || event.key === 'Enter') && this.pressed[i]) this.up(String(i)); });
      svg.appendChild(button);
    }
  }

  private setPressed(key: string, pressed: boolean): void {
    if (!/^(?:[0-9]|1[01])$/.test(key)) throw new Error(`mpr121: unknown electrode '${key}'`);
    const electrode = Number(key);
    if (this.pressed[electrode] === pressed) throw new Error(`mpr121: electrode ${key} is already ${pressed ? 'down' : 'up'}`);
    this.pressed[electrode] = pressed;
    this.shadowRoot!.querySelector(`[data-key="${key}"]`)!.setAttribute('aria-pressed', String(pressed));
    this.dispatchEvent(new CustomEvent('touch-change', { detail: { electrode, pressed } }));
  }
  down(key: string): void { this.setPressed(key, true); }
  up(key: string): void { this.setPressed(key, false); }
}

if (!customElements.get('velxio-mpr121')) customElements.define('velxio-mpr121', Mpr121Element);
