/**
 * Sen0244Element.ts — DFRobot Gravity analog TDS sensor (SEN0244), top-down,
 * with its probe plugged into the XH2.54 socket.
 *
 * Geometry (CSS px, 96 dpi, canvas 224 × 155): the 42 × 32 mm board spans
 * x 47.2–206; the PH2.0 connector's three pins leave the right edge, 9.6 px
 * apart, silkscreened −, +, A from the top. The A pin is named `signal`, the
 * EmbedGym-Bench `task.json` spelling.
 */

const W = 224;
const H = 155;

const PIN_INFO = [
  { name: '−', x: 224, y: 50.9, number: 1, signals: [{ type: 'power', signal: 'GND' }] },
  { name: '+', x: 224, y: 60.5, number: 2, signals: [{ type: 'power', signal: 'VCC' }] },
  { name: 'signal', x: 224, y: 70.1, number: 3, signals: [] as Array<unknown> },
];

class Sen0244Element extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <g transform="scale(3.7795) translate(12.5 0)" font-family="Arial, Helvetica, sans-serif">
        <path d="M-5.6 16H-6.9A3 3 0 0 0 -9.9 19V34.5A3 3 0 0 0 -6.9 37.5H-5.4" fill="none" stroke="#1c1c1c" stroke-width="3.0"/>
        <path d="M3 0.1H39A2.9 2.9 0 0 1 41.9 3V29A2.9 2.9 0 0 1 39 31.9H3A2.9 2.9 0 0 1 0.1 29V3A2.9 2.9 0 0 1 3 0.1Z M5.1 3.5A1.6 1.6 0 1 0 1.9 3.5A1.6 1.6 0 1 0 5.1 3.5Z M40.1 3.5A1.6 1.6 0 1 0 36.9 3.5A1.6 1.6 0 1 0 40.1 3.5Z M5.1 28.5A1.6 1.6 0 1 0 1.9 28.5A1.6 1.6 0 1 0 5.1 28.5Z M40.1 28.5A1.6 1.6 0 1 0 36.9 28.5A1.6 1.6 0 1 0 40.1 28.5Z" fill="#161616" fill-rule="evenodd" stroke="#000" stroke-width="0.2"/>
        <circle cx="3.5" cy="3.5" r="2.35" fill="none" stroke="#c9a54a" stroke-width="1.3"/>
        <circle cx="5.67" cy="4.40" r="0.28" fill="#8a6d22"/>
        <circle cx="4.40" cy="5.67" r="0.28" fill="#8a6d22"/>
        <circle cx="2.60" cy="5.67" r="0.28" fill="#8a6d22"/>
        <circle cx="1.33" cy="4.40" r="0.28" fill="#8a6d22"/>
        <circle cx="1.33" cy="2.60" r="0.28" fill="#8a6d22"/>
        <circle cx="2.60" cy="1.33" r="0.28" fill="#8a6d22"/>
        <circle cx="4.40" cy="1.33" r="0.28" fill="#8a6d22"/>
        <circle cx="5.67" cy="2.60" r="0.28" fill="#8a6d22"/>
        <circle cx="38.5" cy="3.5" r="2.35" fill="none" stroke="#c9a54a" stroke-width="1.3"/>
        <circle cx="40.67" cy="4.40" r="0.28" fill="#8a6d22"/>
        <circle cx="39.40" cy="5.67" r="0.28" fill="#8a6d22"/>
        <circle cx="37.60" cy="5.67" r="0.28" fill="#8a6d22"/>
        <circle cx="36.33" cy="4.40" r="0.28" fill="#8a6d22"/>
        <circle cx="36.33" cy="2.60" r="0.28" fill="#8a6d22"/>
        <circle cx="37.60" cy="1.33" r="0.28" fill="#8a6d22"/>
        <circle cx="39.40" cy="1.33" r="0.28" fill="#8a6d22"/>
        <circle cx="40.67" cy="2.60" r="0.28" fill="#8a6d22"/>
        <circle cx="3.5" cy="28.5" r="2.35" fill="none" stroke="#c9a54a" stroke-width="1.3"/>
        <circle cx="5.67" cy="29.40" r="0.28" fill="#8a6d22"/>
        <circle cx="4.40" cy="30.67" r="0.28" fill="#8a6d22"/>
        <circle cx="2.60" cy="30.67" r="0.28" fill="#8a6d22"/>
        <circle cx="1.33" cy="29.40" r="0.28" fill="#8a6d22"/>
        <circle cx="1.33" cy="27.60" r="0.28" fill="#8a6d22"/>
        <circle cx="2.60" cy="26.33" r="0.28" fill="#8a6d22"/>
        <circle cx="4.40" cy="26.33" r="0.28" fill="#8a6d22"/>
        <circle cx="5.67" cy="27.60" r="0.28" fill="#8a6d22"/>
        <circle cx="38.5" cy="28.5" r="2.35" fill="none" stroke="#c9a54a" stroke-width="1.3"/>
        <circle cx="40.67" cy="29.40" r="0.28" fill="#8a6d22"/>
        <circle cx="39.40" cy="30.67" r="0.28" fill="#8a6d22"/>
        <circle cx="37.60" cy="30.67" r="0.28" fill="#8a6d22"/>
        <circle cx="36.33" cy="29.40" r="0.28" fill="#8a6d22"/>
        <circle cx="36.33" cy="27.60" r="0.28" fill="#8a6d22"/>
        <circle cx="37.60" cy="26.33" r="0.28" fill="#8a6d22"/>
        <circle cx="39.40" cy="26.33" r="0.28" fill="#8a6d22"/>
        <circle cx="40.67" cy="27.60" r="0.28" fill="#8a6d22"/>
        <circle cx="8.3" cy="1.9" r="0.75" fill="#c9a54a"/><circle cx="8.3" cy="1.9" r="0.35" fill="#8a6d22"/>
        <circle cx="40.1" cy="23.9" r="0.75" fill="#c9a54a"/><circle cx="40.1" cy="23.9" r="0.35" fill="#8a6d22"/>
        <rect x="16.9" y="1.2" width="8.5" height="2.35" fill="#f2f2f2"/>
        <text x="21.15" y="3.0" font-size="2.05" fill="#111" text-anchor="middle" textLength="7.6" lengthAdjust="spacingAndGlyphs">Gravity</text>
        <text x="21.1" y="6.15" font-size="2.35" font-weight="bold" fill="#c9a54a" text-anchor="middle" textLength="18.6" lengthAdjust="spacingAndGlyphs">TDS Meter V1.0</text>
        <rect x="39.0" y="7.6" width="2.6" height="2.8" fill="#f2f2f2"/>
        <text x="40.3" y="9.0" font-size="2.4" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="central">A</text>
        <rect x="32.3" y="4.1" width="0.8" height="1.8" fill="#c8cacd"/><rect x="32.3" y="4.55" width="0.8" height="0.9" fill="#e9efe4"/>
        <rect x="9.35" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="9.35" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="10.85" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="10.85" y="8.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="12.45" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="12.45" y="8.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="14.05" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="14.05" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="19.25" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="19.25" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="20.85" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="20.85" y="8.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="22.45" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="22.45" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="24.05" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="24.05" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="25.75" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="25.75" y="8.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="27.45" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="27.45" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="29.05" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="29.05" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="30.55" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="30.55" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="32.15" y="8.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="32.15" y="8.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="16.05" y="9.80" width="0.4" height="0.7" fill="#c8cacd"/>
        <rect x="17.95" y="9.80" width="0.4" height="0.7" fill="#c8cacd"/>
        <rect x="17.00" y="7.90" width="0.4" height="0.7" fill="#c8cacd"/>
        <rect x="15.75" y="8.50" width="2.9" height="1.4" fill="#2e2e2e" stroke="#4a4a4a" stroke-width="0.1"/>
        <rect x="16.35" y="11.55" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="16.75" y="11.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="13.40" y="13.82" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="13.82" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="13.40" y="15.09" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="15.09" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="13.40" y="16.36" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="16.36" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="13.40" y="17.63" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="17.63" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="13.40" y="18.90" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="18.90" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="13.40" y="20.17" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="20.17" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="13.40" y="21.44" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="18.30" y="21.44" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="14.4" y="13.4" width="3.9" height="8.9" fill="#2e2e2e" stroke="#4a4a4a" stroke-width="0.12"/>
        <circle cx="15.10" cy="14.10" r="0.3" fill="#1e1e1e"/>
        <text x="16.35" y="17.85" font-size="1.05" fill="#8d8d8d" text-anchor="middle" dominant-baseline="central" transform="rotate(90 16.35 17.85)">LMV324</text>
        <rect x="22.30" y="13.23" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="13.23" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="14.50" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="14.50" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="15.78" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="15.78" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="17.05" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="17.05" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="18.32" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="18.32" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="19.59" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="19.59" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="20.86" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="20.86" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="22.30" y="22.12" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="27.30" y="22.12" width="1.0" height="0.44" fill="#c8cacd"/>
        <rect x="23.3" y="12.8" width="4.0" height="10.2" fill="#2e2e2e" stroke="#4a4a4a" stroke-width="0.12"/>
        <circle cx="24.00" cy="13.50" r="0.3" fill="#1e1e1e"/>
        <text x="25.30" y="17.90" font-size="1.05" fill="#8d8d8d" text-anchor="middle" dominant-baseline="central" transform="rotate(90 25.30 17.90)">CD4060</text>
        <rect x="30.15" y="21.95" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="30.55" y="21.95" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="7.75" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="8.15" y="24.35" width="0.9" height="0.9" fill="#262626"/>
        <rect x="10.75" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="11.15" y="24.35" width="0.9" height="0.9" fill="#262626"/>
        <rect x="13.75" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="14.15" y="24.35" width="0.9" height="0.9" fill="#262626"/>
        <rect x="16.55" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="16.95" y="24.35" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="19.45" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="19.85" y="24.35" width="0.9" height="0.9" fill="#262626"/>
        <rect x="22.75" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="23.15" y="24.35" width="0.9" height="0.9" fill="#262626"/>
        <rect x="26.55" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="26.95" y="24.35" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="29.55" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="29.95" y="24.35" width="0.9" height="0.9" fill="#262626"/>
        <rect x="32.55" y="24.35" width="1.7" height="0.9" fill="#c8cacd"/>
        <rect x="32.95" y="24.35" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="7.95" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="7.95" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="10.05" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="10.05" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="12.05" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="12.05" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="13.95" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="13.95" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="15.85" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="15.85" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="17.75" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="17.75" y="27.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="19.55" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="19.55" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="21.25" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="21.25" y="27.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="22.95" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="22.95" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="24.75" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="24.75" y="27.55" width="0.9" height="0.9" fill="#a88b5e"/>
        <rect x="26.45" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="26.45" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="28.05" y="27.15" width="0.9" height="1.7" fill="#c8cacd"/>
        <rect x="28.05" y="27.55" width="0.9" height="0.9" fill="#262626"/>
        <rect x="30.35" y="28.70" width="0.4" height="0.7" fill="#c8cacd"/>
        <rect x="32.25" y="28.70" width="0.4" height="0.7" fill="#c8cacd"/>
        <rect x="31.30" y="26.80" width="0.4" height="0.7" fill="#c8cacd"/>
        <rect x="30.05" y="27.40" width="2.9" height="1.4" fill="#2e2e2e" stroke="#4a4a4a" stroke-width="0.1"/>
        <rect x="32.9" y="13.45" width="1.9" height="1.1" fill="#c9a54a"/>
        <rect x="33.1" y="13.68" width="1.6" height="0.64" fill="#c8cacd"/>
        <rect x="32.9" y="15.45" width="1.9" height="1.1" fill="#c9a54a"/>
        <rect x="33.1" y="15.68" width="1.6" height="0.64" fill="#c8cacd"/>
        <rect x="32.9" y="17.45" width="1.9" height="1.1" fill="#c9a54a"/>
        <rect x="33.1" y="17.68" width="1.6" height="0.64" fill="#c8cacd"/>
        <rect x="34.6" y="11.0" width="7.7" height="10.0" fill="#efe3c6" stroke="#d9c9a4" stroke-width="0.2"/>
        <rect x="37.3" y="12.6" width="3.7" height="6.8" fill="#d9c9a4"/>
        <rect x="34.6" y="12.6" width="1.2" height="6.8" fill="#d9c9a4"/>
        <rect x="41.3" y="12.6" width="1.0" height="6.8" fill="#e6d6b2"/>
        <text x="31.6" y="14.0" font-size="1.7" font-weight="bold" fill="#f2f2f2" text-anchor="middle" dominant-baseline="central">−</text>
        <text x="31.6" y="16.0" font-size="1.7" font-weight="bold" fill="#f2f2f2" text-anchor="middle" dominant-baseline="central">+</text>
        <text x="31.6" y="18.0" font-size="1.7" font-weight="bold" fill="#f2f2f2" text-anchor="middle" dominant-baseline="central">A</text>
        <rect x="7.3" y="14.15" width="3.2" height="1.2" fill="#c9a54a"/>
        <rect x="7.4" y="14.43" width="2.9" height="0.64" fill="#c8cacd"/>
        <rect x="7.3" y="16.65" width="3.2" height="1.2" fill="#c9a54a"/>
        <rect x="7.4" y="16.93" width="2.9" height="0.64" fill="#c8cacd"/>
        <rect x="-0.8" y="11.0" width="7.4" height="10.2" fill="#efe3c6" stroke="#d9c9a4" stroke-width="0.2"/>
        <rect x="5.4" y="11.6" width="1.2" height="9.0" fill="#d9c9a4"/>
        <rect x="-4.4" y="12.9" width="7.0" height="6.2" fill="#f7f0de" stroke="#d9c9a4" stroke-width="0.2"/>
        <rect x="0.2" y="13.6" width="2.0" height="4.8" fill="#d9c9a4"/>
        <path d="M-4.4 14.75H-5.9" stroke="#d63a2f" stroke-width="1.0"/>
        <path d="M-4.4 17.25H-5.9" stroke="#2f6fd6" stroke-width="1.0"/>
        <path d="M-6 35.7L13.6 34.6V40.4L-6 39.3Z" fill="#1c1c1c"/>
        <path d="M-3.50 35.4V39.6M-1.90 35.4V39.6M-0.30 35.4V39.6M1.30 35.4V39.6M2.90 35.4V39.6M4.50 35.4V39.6M6.10 35.4V39.6M7.70 35.4V39.6M9.30 35.4V39.6" stroke="#3a3a3a" stroke-width="0.5"/>
        <rect x="13.6" y="34.4" width="22.6" height="6.2" rx="0.6" fill="#1c1c1c"/>
        <path d="M14.4 35.3H35.4" stroke="#333" stroke-width="0.5"/>
        <rect x="36.0" y="35.2" width="1.8" height="4.6" rx="0.4" fill="#2a2a2a"/>
        <rect x="37.6" y="35.9" width="6.6" height="0.8" rx="0.4" fill="#c8cacd" stroke="#8f959b" stroke-width="0.1"/>
        <rect x="37.6" y="38.300000000000004" width="6.6" height="0.8" rx="0.4" fill="#c8cacd" stroke="#8f959b" stroke-width="0.1"/>
        </g>
        <g stroke="#b9bcbf" stroke-width="2.2">
        <path d="M207.1 50.9H224"/><path d="M207.1 60.5H224"/><path d="M207.1 70.1H224"/>
        </g>
      </svg>
    `;
  }
}

if (!customElements.get('velxio-sen0244')) {
  customElements.define('velxio-sen0244', Sen0244Element);
}

export { Sen0244Element };
