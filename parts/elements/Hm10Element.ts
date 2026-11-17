export interface Hm10Controller {
  remoteOn(): void;
  remoteOff(): void;
  connect(): void;
  subscribe(): void;
  disconnect(): void;
  sendRemote(bytes: readonly number[], withResponse: boolean): void;
  notifyRemote(bytes: readonly number[]): void;
  readRemote(): void;
  ancsNotify(): void;
  resetDown(): void;
  resetUp(): void;
  keyDown(): void;
  keyUp(): void;
}

export class Hm10Element extends HTMLElement {
  readonly pinInfo = [
    { name: 'VCC', x: 15.6, y: 155 },
    { name: 'GND', x: 25.2, y: 155 },
    { name: 'TXD', x: 34.8, y: 155 },
    { name: 'RXD', x: 44.4, y: 155 },
    { name: 'UART_TX', number: 1, x: 2.2, y: 27.435 },
    { name: 'UART_RX', number: 2, x: 2.2, y: 33.104 },
    { name: 'UART_CTS', number: 3, x: 2.2, y: 38.773 },
    { name: 'UART_RTS', number: 4, x: 2.2, y: 44.443 },
    { name: 'RESETB', number: 11, x: 2.2, y: 84.128 },
    { name: 'VCC12', number: 12, x: 2.2, y: 89.797 },
    { name: 'GND13', number: 13, x: 2.2, y: 95.466 },
    { name: 'GND14', number: 14, x: 13.178, y: 108.169 },
    { name: 'GND21', number: 21, x: 46.778, y: 108.169 },
    { name: 'GND22', number: 22, x: 57.794, y: 95.466 },
    { name: 'PIO0', number: 23, x: 57.794, y: 89.797 },
    { name: 'PIO1', number: 24, x: 57.794, y: 84.128 },
    { name: 'PIO2', number: 25, x: 57.794, y: 78.458 },
    { name: 'PIO3', number: 26, x: 57.794, y: 72.789 },
    { name: 'PIO4', number: 27, x: 57.794, y: 67.12 },
    { name: 'PIO5', number: 28, x: 57.794, y: 61.45 },
    { name: 'PIO6', number: 29, x: 57.794, y: 55.781 },
    { name: 'PIO7', number: 30, x: 57.794, y: 50.112 },
    { name: 'PIO8', number: 31, x: 57.794, y: 44.443 },
    { name: 'PIO9', number: 32, x: 57.794, y: 38.773 },
    { name: 'PIO10', number: 33, x: 57.794, y: 33.104 },
    { name: 'PIO11', number: 34, x: 57.794, y: 27.435 },
  ];
  startupConfiguration = '{}';
  savedMode = 0;
  savedRole = 0;
  savedSecurity = 0;
  savedPin = '000000';
  savedUuid = 0xffe0;
  savedCharacteristic = 0xffe1;
  savedSecondCharacteristic = false;
  savedWriteResponse = false;
  remoteAddress = 'A1B2C3D4E5F6';
  remotePin = '000000';
  remoteAuthenticated = true;
  remoteBonding = true;
  remoteIntervalMs = 30;
  remoteAncs = false;
  ancsEventId = 0;
  ancsEventFlags = 0;
  ancsCategoryId = 1;
  ancsCategoryCount = 1;
  ancsUid = 0;
  ancsAppIdentifier = 'com.apple.mobilephone';
  ancsTitle = 'Caller';
  ancsSubtitle = '';
  ancsMessage = 'Incoming call';
  ancsDate = '20260101T120000';
  identity = '00112233ABCD';
  connected = false;
  sleeping = false;
  remoteRxHex = '';
  uartRxHex = '';
  remoteReadHex = '';
  resetHeld = false;
  keyHeld = false;
  private controller: Hm10Controller | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="155" viewBox="0 0 60 155">
<path d="M.5 26H59.5V154.5H.5Z" fill="#24282a" stroke="#777d80" stroke-width=".6"/>
<rect x="5.43" y="0.6" width="49.134" height="101.669" fill="#173d86" stroke="#81919b" stroke-width=".6"/>
<text x="30" y="15" font-family="Arial,sans-serif" font-size="5.6" fill="#e4e8e9" text-anchor="middle">HM-10</text>
<rect x="2.2" y="25.935" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="31.604" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="37.273" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="42.943" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="48.612" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="54.281" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="59.950" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="65.620" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="71.289" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="76.958" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="82.628" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="88.297" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="2.2" y="93.966" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="93.966" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="88.297" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="82.628" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="76.958" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="71.289" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="65.620" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="59.950" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="54.281" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="48.612" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="42.943" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="37.273" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="31.604" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="51.594" y="25.935" width="6.2" height="3" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="11.678" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="16.478" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="21.278" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="26.078" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="30.878" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="35.678" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="40.478" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="45.278" y="100.969" width="3" height="7.2" rx=".25" fill="#c7cbcc" stroke="#9a9fa1" stroke-width=".25"/>
<rect x="13" y="19" width="5.3" height="2.6" rx=".25" fill="#bfc5c7"/>
<rect x="14" y="19" width="3.3" height="2.6" fill="#496653"/>
<rect x="20.5" y="19" width="5.3" height="2.6" rx=".25" fill="#bfc5c7"/>
<rect x="21.5" y="19" width="3.3" height="2.6" fill="#b8a786"/>
<rect x="27" y="25" width="2.7" height="5.4" rx=".25" fill="#bfc5c7"/>
<rect x="27" y="26" width="2.7" height="3.4000000000000004" fill="#354146"/>
<rect x="27" y="32" width="2.7" height="5.4" rx=".25" fill="#bfc5c7"/>
<rect x="27" y="33" width="2.7" height="3.4000000000000004" fill="#354146"/>
<rect x="12.4" y="31" width="5.8" height="12.8" rx=".7" fill="#d0d0c7" stroke="#a4acae" stroke-width=".5"/>
<rect x="35.2" y="31.5" width="11.3" height="10.7" rx=".35" fill="#353a3d" stroke="#879093" stroke-width=".5"/>
<text x="40.8" y="37.9" fill="#c7cccd" font-size="2.4" font-family="Arial,sans-serif" text-anchor="middle">32K</text>
<rect x="11.5" y="45.5" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="11.5" y="46.5" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="17.6" y="45.5" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="17.6" y="46.5" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="23.7" y="45.5" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="23.7" y="46.5" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="29.8" y="45.5" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="29.8" y="46.5" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="35.9" y="45.5" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="35.9" y="46.5" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="42" y="45.5" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="42" y="46.5" width="2.7" height="3.2" fill="#333b3e"/>
<path d="M20.20 53.2V57 M20.20 78.8V82.6 M16.7 57.30H20.2 M40.6 57.30H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M22.18 53.2V57 M22.18 78.8V82.6 M16.7 59.43H20.2 M40.6 59.43H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M24.16 53.2V57 M24.16 78.8V82.6 M16.7 61.56H20.2 M40.6 61.56H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M26.14 53.2V57 M26.14 78.8V82.6 M16.7 63.69H20.2 M40.6 63.69H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M28.12 53.2V57 M28.12 78.8V82.6 M16.7 65.82H20.2 M40.6 65.82H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M30.10 53.2V57 M30.10 78.8V82.6 M16.7 67.95H20.2 M40.6 67.95H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M32.08 53.2V57 M32.08 78.8V82.6 M16.7 70.08H20.2 M40.6 70.08H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M34.06 53.2V57 M34.06 78.8V82.6 M16.7 72.21H20.2 M40.6 72.21H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M36.04 53.2V57 M36.04 78.8V82.6 M16.7 74.34H20.2 M40.6 74.34H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<path d="M38.02 53.2V57 M38.02 78.8V82.6 M16.7 76.47H20.2 M40.6 76.47H44.1" fill="none" stroke="#bfc5c7" stroke-width=".85"/>
<rect x="19.3" y="56.1" width="22.1" height="23.9" rx=".6" fill="#383d3f" stroke="#1e2427" stroke-width=".7"/>
<circle cx="21.3" cy="58.2" r=".6" fill="#a3aeb0"/>
<text x="30.3" y="66.4" font-family="Arial,sans-serif" font-size="3.6" fill="#c3c9ca" text-anchor="middle">CC2541</text>
<text x="30.3" y="72" font-family="Arial,sans-serif" font-size="3.2" fill="#c3c9ca" text-anchor="middle">F256</text>
<rect x="11.8" y="57" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="11.8" y="58" width="2.7" height="3.2" fill="#b8a786"/>
<rect x="11.8" y="65" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="11.8" y="66" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="11.8" y="73" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="11.8" y="74" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="11.8" y="81" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="11.8" y="82" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="11.8" y="89" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="11.8" y="90" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="22" y="91" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="22" y="92" width="2.7" height="3.2" fill="#b8a786"/>
<rect x="37" y="84" width="5.4" height="2.7" rx=".25" fill="#bfc5c7"/>
<rect x="38" y="84" width="3.4000000000000004" height="2.7" fill="#b8a786"/>
<rect x="28.8" y="96.2" width="5.4" height="2.7" rx=".25" fill="#bfc5c7"/>
<rect x="29.8" y="96.2" width="3.4000000000000004" height="2.7" fill="#333b3e"/>
<g fill="#bec5c7"><rect x="13" y="112.8" width="1.2" height="10.8"/><rect x="19" y="112.8" width="1.2" height="10.8"/><rect x="23" y="130" width="1" height="8.9"/><rect x="26" y="130" width="1" height="8.9"/><rect x="29" y="130" width="1" height="8.9"/></g>
<rect x="12" y="116" width="9" height="5.2" rx=".3" fill="#393e40" stroke="#1b2021" stroke-width=".5"/>
<rect x="22" y="132.2" width="8.9" height="4.7" rx=".3" fill="#393e40" stroke="#1b2021" stroke-width=".5"/>
<rect x="5.5" y="115" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="5.5" y="116" width="2.7" height="3.2" fill="#b8a786"/>
<rect x="25" y="115" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="25" y="116" width="2.7" height="3.2" fill="#b8a786"/>
<rect x="32" y="112" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="32" y="113" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="32" y="120" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="32" y="121" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="43.5" y="121" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="43.5" y="122" width="2.7" height="3.2" fill="#b8a786"/>
<rect x="8" y="130" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="8" y="131" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="15" y="130" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="15" y="131" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="34" y="130" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="34" y="131" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="43" y="130" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="43" y="131" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="52" y="130" width="2.7" height="5.2" rx=".25" fill="#bfc5c7"/>
<rect x="52" y="131" width="2.7" height="3.2" fill="#333b3e"/>
<rect x="43" y="111.6" width="8" height="4.3" rx=".35" fill="#b4b794" stroke="#d4d8cb" stroke-width=".55"/><rect id="hm10-status-led" x="45.8" y="112.8" width="2.4" height="1.8" fill="#6c895e"/>
<g font-family="Arial,sans-serif" font-size="3.4" text-anchor="middle" fill="#e5e8e8">
<text x="15.6" y="143.6">VCC</text>
<text x="25.2" y="143.6">GND</text>
<text x="34.8" y="143.6">TXD</text>
<text x="44.4" y="143.6">RXD</text>
</g>
<rect x="2.6" y="146" width="6.8" height="8.5" rx=".6" fill="#343a3d"/>
<rect x="4.85" y="149" width="2.3" height="6" fill="#c6cacc" stroke="#9ca6a8" stroke-width=".25"/>
<rect x="12.2" y="146" width="6.8" height="8.5" rx=".6" fill="#343a3d"/>
<rect x="14.45" y="149" width="2.3" height="6" fill="#c6cacc" stroke="#9ca6a8" stroke-width=".25"/>
<rect x="21.8" y="146" width="6.8" height="8.5" rx=".6" fill="#343a3d"/>
<rect x="24.05" y="149" width="2.3" height="6" fill="#c6cacc" stroke="#9ca6a8" stroke-width=".25"/>
<rect x="31.4" y="146" width="6.8" height="8.5" rx=".6" fill="#343a3d"/>
<rect x="33.65" y="149" width="2.3" height="6" fill="#c6cacc" stroke="#9ca6a8" stroke-width=".25"/>
<rect x="41.0" y="146" width="6.8" height="8.5" rx=".6" fill="#343a3d"/>
<rect x="43.25" y="149" width="2.3" height="6" fill="#c6cacc" stroke="#9ca6a8" stroke-width=".25"/>
<rect x="50.6" y="146" width="6.8" height="8.5" rx=".6" fill="#343a3d"/>
<rect x="52.85" y="149" width="2.3" height="6" fill="#c6cacc" stroke="#9ca6a8" stroke-width=".25"/>
</svg>
<style>:host{display:inline-block;line-height:0}svg{display:block}dialog{line-height:1.5;font:13px system-ui;border:1px solid #69747f;border-radius:6px;padding:16px}label{display:block}input{margin:4px;width:180px}button{margin:4px}</style>
<dialog>
<form method="dialog">
<b>BLE partner</b>
<label>Address <input name="address" value="A1B2C3D4E5F6" maxlength="12">
</label>
<label>PIN <input name="pin" value="000000" maxlength="6">
</label>
<label>Bytes (hex) <input name="bytes" value="31">
</label>
<div>
<button type="button" data-action="remoteOn">Nearby</button>
<button type="button" data-action="remoteOff">Out of range</button>
<button type="button" data-action="connect">Connect</button>
<button type="button" data-action="subscribe">Subscribe</button>
<button type="button" data-action="disconnect">Disconnect</button>
<button type="button" data-send>Write without response</button>
<button type="button" data-send-response>Write with response</button>
<button type="button" data-notify>Notify central</button>
<button type="button" data-action="readRemote">Read</button>
<button type="button" data-action="ancsNotify">ANCS notification</button>
<output data-read>
</output>
</div>
<div>
<button type="button" data-action="resetDown">Hold RESETB</button>
<button type="button" data-action="resetUp">Release RESETB</button>
<button type="button" data-action="keyDown">Hold PIO0</button>
<button type="button" data-action="keyUp">Release PIO0</button>
</div>
<button>Close</button>
</form>
</dialog>`;
    this.shadowRoot!.querySelector('svg')!.addEventListener('dblclick', () => (this.shadowRoot!.querySelector('dialog') as HTMLDialogElement).showModal());
    for (const button of Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-action]'))) {
      button.addEventListener('click', () => {
        this.updatePartnerInputs();
        const action = button.dataset.action as keyof Hm10Controller;
        if (action === 'sendRemote' || action === 'notifyRemote') throw new Error('hm10: write requires bytes');
        this[action]();
      });
    }
    const send = (withResponse: boolean) => {
      const hex = (this.shadowRoot!.querySelector('[name="bytes"]') as HTMLInputElement).value;
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error('hm10: hex write requires complete nonempty bytes');
      const bytes = hex.match(/../g)!.map((byte) => parseInt(byte, 16));
      if (withResponse) this.sendRemoteWithResponse(bytes); else this.sendRemote(bytes);
    };
    this.shadowRoot!.querySelector('[data-send]')!.addEventListener('click', () => send(false));
    this.shadowRoot!.querySelector('[data-send-response]')!.addEventListener('click', () => send(true));
    this.shadowRoot!.querySelector('[data-notify]')!.addEventListener('click', () => {
      const hex = (this.shadowRoot!.querySelector('[name="bytes"]') as HTMLInputElement).value;
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error('hm10: notification requires complete nonempty bytes');
      this.notifyRemote(hex.match(/../g)!.map((byte) => parseInt(byte, 16)));
    });
    this.showStatus(false);
  }

  bindController(controller: Hm10Controller | null): void { this.controller = controller; }
  private requireController(): Hm10Controller {
    if (!this.controller) throw new Error('hm10: simulation is not attached');
    return this.controller;
  }
  private updatePartnerInputs(): void {
    this.remoteAddress = (this.shadowRoot!.querySelector('[name="address"]') as HTMLInputElement).value.toUpperCase();
    this.remotePin = (this.shadowRoot!.querySelector('[name="pin"]') as HTMLInputElement).value;
    if (!/^[0-9A-F]{12}$/.test(this.remoteAddress) || !/^\d{6}$/.test(this.remotePin)) throw new Error('hm10: partner address requires12hex digits and PIN requires6digits');
  }
  remoteOn(): void { this.requireController().remoteOn(); }
  remoteOff(): void { this.requireController().remoteOff(); }
  connect(): void { this.requireController().connect(); }
  subscribe(): void { this.requireController().subscribe(); }
  disconnect(): void { this.requireController().disconnect(); }
  sendRemote(bytes: readonly number[]): void {
    if (!bytes.length || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('hm10: remote write requires bytes0..255');
    this.requireController().sendRemote(bytes, false);
  }
  sendRemoteWithResponse(bytes: readonly number[]): void {
    if (!bytes.length || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('hm10: remote write requires bytes0..255');
    this.requireController().sendRemote(bytes, true);
  }
  notifyRemote(bytes: readonly number[]): void {
    if (!bytes.length || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('hm10: remote notification requires bytes0..255');
    this.requireController().notifyRemote(bytes);
  }
  readRemote(): void { this.requireController().readRemote(); this.shadowRoot!.querySelector('[data-read]')!.textContent = this.remoteReadHex; }
  ancsNotify(): void { this.requireController().ancsNotify(); }
  resetDown(): void { this.requireController().resetDown(); }
  resetUp(): void { this.requireController().resetUp(); }
  keyDown(): void { this.requireController().keyDown(); }
  keyUp(): void { this.requireController().keyUp(); }
  showStatus(high: boolean): void { this.shadowRoot!.querySelector('#hm10-status-led')!.setAttribute('fill', high ? '#90c55a' : '#4b5936'); }
}
if (!customElements.get('velxio-hm10')) customElements.define('velxio-hm10', Hm10Element);
