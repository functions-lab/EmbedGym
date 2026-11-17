/**
 * JoystickElement.ts — KY-023 2-axis analog joystick module
 *
 * Velxio-native module: the wokwi analog-joystick element uses VERT/HORZ/SEL
 * pin names and directional output, which doesn't match the EmbedGym-Bench
 * pinout (GND/VCC/VRx/VRy/SW). Pin names here are
 * what circuit wiring and role resolution key off.
 *
 * Geometry (CSS px, canvas 72 × 68):
 *   Board: rounded rect spanning the full canvas, a mounting hole per corner.
 *   Stick: dome knob overhanging a square potentiometer base, centered.
 *   Header: five pins along the bottom edge at x = 8 / 22 / 36 / 50 / 64.
 */

const W = 72;
const H = 68;
const PIN_Y = 68;

const BOARD = '#1e5b2f';
const BOARD_EDGE = '#0d3b1c';
const BASE = '#111827';
const KNOB = '#374151';
const KNOB_TOP = '#6b7280';
const LABEL = '#e5e7eb';
const HEADER = '#111827';
const PIN_METAL = '#d4a017';

const PIN_NAMES = ['GND', 'VCC', 'VRx', 'VRy', 'SW'];

const PIN_INFO = PIN_NAMES.map((name, i) => ({
  name,
  x: 8 + 14 * i,
  y: PIN_Y,
  number: i + 1,
  signals:
    name === 'VCC'
      ? [{ type: 'power', signal: 'VCC' }]
      : name === 'GND'
        ? [{ type: 'power', signal: 'GND' }]
        : ([] as Array<unknown>),
}));

class JoystickElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  constructor() {
    super();
    const pins = PIN_INFO.map(
      (p) => `
        <line x1="${p.x}" y1="${H - 10}" x2="${p.x}" y2="${PIN_Y}" stroke="${PIN_METAL}" stroke-width="2.5"/>
        <text x="${p.x}" y="${H - 14}" text-anchor="middle" font-family="sans-serif"
              font-size="5" fill="${LABEL}">${p.name}</text>`,
    ).join('');
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${W - 2}" height="${H - 12}" rx="3"
              fill="${BOARD}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>

        <!-- Corner mounting holes. -->
        <circle cx="6" cy="6" r="2" fill="none" stroke="${PIN_METAL}" stroke-width="1"/>
        <circle cx="66" cy="6" r="2" fill="none" stroke="${PIN_METAL}" stroke-width="1"/>
        <circle cx="6" cy="44" r="2" fill="none" stroke="${PIN_METAL}" stroke-width="1"/>
        <circle cx="66" cy="44" r="2" fill="none" stroke="${PIN_METAL}" stroke-width="1"/>

        <!-- Stick: square potentiometer base, dome knob overhanging it. -->
        <rect x="22" y="10" width="28" height="28" rx="3" fill="${BASE}"/>
        <circle cx="36" cy="24" r="17" fill="${KNOB}"/>
        <circle cx="36" cy="24" r="10" fill="${KNOB_TOP}"/>

        <text x="10" y="50" font-family="monospace" font-size="6"
              font-weight="bold" fill="${LABEL}">KY-023</text>

        <!-- Header strip and the five pins. -->
        <rect x="2" y="${H - 12}" width="${W - 4}" height="7" fill="${HEADER}"/>
        ${pins}
      </svg>`;
  }
}

if (!customElements.get('velxio-joystick')) {
  customElements.define('velxio-joystick', JoystickElement);
}

export { JoystickElement };
