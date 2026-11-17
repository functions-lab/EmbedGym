export class L298nElement extends HTMLElement {
  readonly pinInfo = [
  {
    "name": "ENA",
    "x": 88.4,
    "y": 156.8,
    "number": 1,
    "signals": []
  },
  {
    "name": "IN1",
    "x": 98.0,
    "y": 156.8,
    "number": 2,
    "signals": []
  },
  {
    "name": "IN2",
    "x": 107.6,
    "y": 156.8,
    "number": 3,
    "signals": []
  },
  {
    "name": "IN3",
    "x": 117.2,
    "y": 156.8,
    "number": 4,
    "signals": []
  },
  {
    "name": "IN4",
    "x": 126.8,
    "y": 156.8,
    "number": 5,
    "signals": []
  },
  {
    "name": "ENB",
    "x": 136.4,
    "y": 156.8,
    "number": 6,
    "signals": []
  },
  {
    "name": "+12V",
    "x": 33.2,
    "y": 156.8,
    "number": 7,
    "signals": [
      {
        "type": "power",
        "signal": "VCC"
      }
    ]
  },
  {
    "name": "GND",
    "x": 53.2,
    "y": 156.8,
    "number": 8,
    "signals": [
      {
        "type": "power",
        "signal": "GND"
      }
    ]
  },
  {
    "name": "+5V",
    "x": 73.2,
    "y": 156.8,
    "number": 9,
    "signals": [
      {
        "type": "power",
        "signal": "VCC"
      }
    ]
  },
  {
    "name": "OUT1",
    "x": 13.6,
    "y": 101.6,
    "number": 10,
    "signals": []
  },
  {
    "name": "OUT2",
    "x": 13.6,
    "y": 123.2,
    "number": 11,
    "signals": []
  },
  {
    "name": "OUT3",
    "x": 148.8,
    "y": 123.2,
    "number": 12,
    "signals": []
  },
  {
    "name": "OUT4",
    "x": 148.8,
    "y": 101.6,
    "number": 13,
    "signals": []
  }
];
  sampleWindowMs = 100;
  private jumpers = { regulatorJumper: true, enaJumper: true, enbJumper: true };
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>:host{display:inline-block;line-height:0}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="162.52" height="169.52" viewBox="0 0 162.52 169.52">
  <defs>
    <mask id="l298n-board-holes">
      <rect width="162.52" height="169.52" fill="white"/>
      <g fill="black">
        <circle cx="11.2" cy="18.2" r="6.4"/><circle cx="151.32" cy="18.2" r="6.4"/>
        <circle cx="11.2" cy="158.32" r="6.4"/><circle cx="151.32" cy="158.32" r="6.4"/>
      </g>
    </mask>
  </defs>
  <g mask="url(#l298n-board-holes)">
    <rect x="0.5" y="7.5" width="161.52" height="161.52" fill="#bd2826" stroke="#e4ae91" stroke-width="1"/>
    <g fill="#c9c8be" stroke="#e9e6dc" stroke-width="0.6">
      <circle cx="11.2" cy="18.2" r="8.9"/><circle cx="151.32" cy="18.2" r="8.9"/>
      <circle cx="11.2" cy="158.32" r="8.9"/><circle cx="151.32" cy="158.32" r="8.9"/>
    </g>
  </g>
  <g fill="#bcc0be">
    <rect x="7.9" y="36.8" width="15.8" height="3.2"/><rect x="7.9" y="49.8" width="15.8" height="3.2"/>
    <rect x="7.9" y="62.8" width="15.8" height="3.2"/><rect x="7.9" y="75.8" width="15.8" height="3.2"/>
    <rect x="138.8" y="36.8" width="15.8" height="3.2"/><rect x="138.8" y="49.8" width="15.8" height="3.2"/>
    <rect x="138.8" y="62.8" width="15.8" height="3.2"/><rect x="138.8" y="75.8" width="15.8" height="3.2"/>
  </g>
  <g fill="#282b2a" stroke="#131615" stroke-width="0.5">
    <rect x="10" y="34.5" width="11.6" height="7.8"/><rect x="10" y="47.5" width="11.6" height="7.8"/>
    <rect x="10" y="60.5" width="11.6" height="7.8"/><rect x="10" y="73.5" width="11.6" height="7.8"/>
    <rect x="140.9" y="34.5" width="11.6" height="7.8"/><rect x="140.9" y="47.5" width="11.6" height="7.8"/>
    <rect x="140.9" y="60.5" width="11.6" height="7.8"/><rect x="140.9" y="73.5" width="11.6" height="7.8"/>
  </g>
  <g fill="#adb2ad">
    <rect x="11" y="34.5" width="1.8" height="7.8"/><rect x="11" y="47.5" width="1.8" height="7.8"/>
    <rect x="11" y="60.5" width="1.8" height="7.8"/><rect x="11" y="73.5" width="1.8" height="7.8"/>
    <rect x="141.9" y="34.5" width="1.8" height="7.8"/><rect x="141.9" y="47.5" width="1.8" height="7.8"/>
    <rect x="141.9" y="60.5" width="1.8" height="7.8"/><rect x="141.9" y="73.5" width="1.8" height="7.8"/>
  </g>
  <g stroke="#bbbebb" stroke-width="1.7">
    <path d="M46 56V76M50.8 56V70M55.6 56V76M60.4 56V70M65.2 56V76M70 56V70M74.8 56V76M79.6 56V70M84.4 56V76M89.2 56V70M94 56V76M98.8 56V70M103.6 56V76M108.4 56V70M113.2 56V76"/>
  </g>
  <rect x="38.8" y="30" width="83.2" height="26.6" fill="#171b19" stroke="#060806" stroke-width="0.8"/>
  <g fill="#202621">
    <rect x="33.6" y="0" width="3.1" height="35.6"/><rect x="51.3" y="0" width="3.1" height="35.6"/>
    <rect x="69" y="0" width="3.1" height="35.6"/><rect x="86.7" y="0" width="3.1" height="35.6"/>
    <rect x="104.4" y="0" width="3.1" height="35.6"/><rect x="122.1" y="0" width="3.1" height="35.6"/>
  </g>
  <rect x="40.2" y="36.9" width="80.3" height="7.8" fill="#babcb7" stroke="#e4e5de" stroke-width="0.5"/>
  <circle cx="43.6" cy="28.7" r="3.3" fill="#d3d5cd"/>
  <circle cx="118.7" cy="28.7" r="3.3" fill="#d3d5cd"/>
  <text x="80.4" y="85.2" font-family="Arial, sans-serif" font-size="7" fill="#f0e5d2" text-anchor="middle">L298N</text>
  <g fill="#bbbfb9">
    <rect x="47" y="109.5" width="3.1" height="6.4"/><rect x="64" y="109.5" width="3.1" height="6.4"/>
    <rect x="97.1" y="135.7" width="3.1" height="6.4"/><rect x="114.1" y="135.7" width="3.1" height="6.4"/>
  </g>
  <circle cx="57" cy="103.3" r="15.3" fill="#232723" stroke="#c3c5bc" stroke-width="0.6"/>
  <circle cx="57" cy="103.3" r="12.9" fill="#c7c9be" stroke="#e2e4d9" stroke-width="0.7"/>
  <circle cx="107.1" cy="128.7" r="15.3" fill="#232723" stroke="#c3c5bc" stroke-width="0.6"/>
  <circle cx="107.1" cy="128.7" r="12.9" fill="#c7c9be" stroke="#e2e4d9" stroke-width="0.7"/>
  <g stroke="#5c645a" stroke-width="0.5" fill="none">
    <path d="M46 103.3H68M57 92.3V114.3M96.1 128.7H118.1M107.1 117.7V139.7"/>
  </g>
  <rect x="91.9" y="86.5" width="31.1" height="22.7" rx="1.5" fill="#bdbfb6"/>
  <rect x="95.4" y="86.5" width="23.6" height="22.7" fill="#232824" stroke="#111512" stroke-width="0.5"/>
  <g fill="#bec0b7">
    <rect x="87.2" y="88.3" width="8.2" height="2.3"/><rect x="87.2" y="96.7" width="8.2" height="2.3"/>
    <rect x="87.2" y="105.1" width="8.2" height="2.3"/>
  </g>
  <g fill="#237fbc" stroke="#12598a" stroke-width="0.9">
    <rect x="1.2" y="92" width="24.8" height="41.6"/><rect x="136.4" y="92" width="24.8" height="41.6"/>
    <rect x="22.8" y="145.4" width="60.8" height="22.4"/>
  </g>
  <g stroke="#5bb7e5" stroke-width="0.6">
    <path d="M1.2 112.4H26M136.4 112.4H161.2M43.2 145.4V167.8M63.2 145.4V167.8"/>
  </g>
  <g fill="#c3cdc9" stroke="#145c87" stroke-width="1.2">
    <circle cx="13.6" cy="101.6" r="6.4"/><circle cx="13.6" cy="123.2" r="6.4"/>
    <circle cx="148.8" cy="101.6" r="6.4"/><circle cx="148.8" cy="123.2" r="6.4"/>
    <circle cx="33.2" cy="156.8" r="6.4"/><circle cx="53.2" cy="156.8" r="6.4"/>
    <circle cx="73.2" cy="156.8" r="6.4"/>
  </g>
  <g stroke="#576967" stroke-width="1">
    <path d="M8.9 101.6H18.3M8.9 123.2H18.3M144.1 101.6H153.5M144.1 123.2H153.5M33.2 152.1V161.5M53.2 152.1V161.5M73.2 152.1V161.5"/>
  </g>
  <rect x="84" y="152.4" width="56.8" height="8.8" fill="#232622"/>
  <g fill="#cecbb5" stroke="#77786a" stroke-width="0.4">
    <rect x="86.7" y="155.1" width="3.4" height="3.4"/><rect x="96.3" y="155.1" width="3.4" height="3.4"/>
    <rect x="105.9" y="155.1" width="3.4" height="3.4"/><rect x="115.5" y="155.1" width="3.4" height="3.4"/>
    <rect x="125.1" y="155.1" width="3.4" height="3.4"/><rect x="134.7" y="155.1" width="3.4" height="3.4"/>
  </g>
  <g fill="#232622">
    <rect x="84" y="142.8" width="8.8" height="8.8"/><rect x="132" y="142.8" width="8.8" height="8.8"/>
    <rect x="37.6" y="123.6" width="17.6" height="6.4"/>
  </g>
  <g fill="#cecbb5">
    <rect x="86.7" y="145.5" width="3.4" height="3.4"/><rect x="134.7" y="145.5" width="3.4" height="3.4"/>
    <rect x="40.3" y="125.1" width="3.4" height="3.4"/><rect x="49.9" y="125.1" width="3.4" height="3.4"/>
  </g>
  <g font-family="Arial, sans-serif" fill="#f0e5d2" text-anchor="middle">
    <g font-size="4.8">
      <text x="13.6" y="89">OUT1</text><text x="13.6" y="140.2">OUT2</text>
      <text x="148.8" y="89">OUT4</text><text x="148.8" y="140.2">OUT3</text>
      <text x="33.2" y="141.5">+12V</text><text x="53.2" y="141.5">GND</text><text x="73.2" y="141.5">+5V</text>
      <text x="88.4" y="140.5">+5V</text><text x="136.4" y="140.5">+5V</text>
    </g>
    <g font-size="4.2">
      <text x="88.4" y="167.4">ENA</text><text x="98" y="167.4">IN1</text><text x="107.6" y="167.4">IN2</text>
      <text x="117.2" y="167.4">IN3</text><text x="126.8" y="167.4">IN4</text><text x="136.4" y="167.4">ENB</text>
      <text x="46.4" y="120.3">5V EN</text>
    </g>
  </g>
<g fill="#1a1a1a"><rect data-jumper="enaJumper" x="85" y="143.8" width="6.8" height="17"/><rect data-jumper="enbJumper" x="133" y="143.8" width="6.8" height="17"/><rect data-jumper="regulatorJumper" x="38.6" y="124.6" width="15.6" height="4.4"/></g></svg>
`;
  }
  private setJumper(key: keyof typeof this.jumpers, value: boolean): void {
    if (typeof value !== 'boolean') throw new Error('l298n: jumpers must be boolean');
    this.jumpers[key] = value;
    (this.shadowRoot!.querySelector(`[data-jumper="${key}"]`) as SVGElement).style.display = value ? '' : 'none';
  }
  get regulatorJumper(): boolean { return this.jumpers.regulatorJumper; }
  set regulatorJumper(value: boolean) { this.setJumper('regulatorJumper', value); }
  get enaJumper(): boolean { return this.jumpers.enaJumper; }
  set enaJumper(value: boolean) { this.setJumper('enaJumper', value); }
  get enbJumper(): boolean { return this.jumpers.enbJumper; }
  set enbJumper(value: boolean) { this.setJumper('enbJumper', value); }
}
if (!customElements.get('velxio-l298n')) customElements.define('velxio-l298n', L298nElement);
