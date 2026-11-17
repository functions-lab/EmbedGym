/**
 * BounceButtonElement.ts — 12 mm tactile pushbutton whose contacts bounce
 *
 * Same footprint, legs and interaction as `wokwi-pushbutton`: legs 1.l / 1.r
 * are one terminal and 2.l / 2.r the other; pressing bridges the two. The
 * contact bounce itself is electrical and lives in the part simulation
 * (parts/sim/BounceButton.ts); this element only reports the actuator.
 *
 * Geometry (viewBox mm, drawn at 17.802 × 12 mm like wokwi-pushbutton):
 *   Body: 12 × 12 mm square at x 0..12; legs stick out 3 mm left and right.
 *   Pin tips (CSS px): left legs at x 0, right legs at x 67, rows y 13 / 32.
 */

const BODY = '#464646';
const PLATE = '#eaeaea';
const CORNER = '#1b1b1b';
const LEG = '#999999';
const CAP_UP = '#f2b705';
const CAP_DOWN = '#b88a00';
const CAP_RIM = '#2f2f2f';
const MARK = '#2f2f2f';

const PIN_INFO = [
  { name: '1.l', x: 0, y: 13, number: 1, signals: [] as Array<unknown> },
  { name: '2.l', x: 0, y: 32, number: 2, signals: [] as Array<unknown> },
  { name: '1.r', x: 67, y: 13, number: 3, signals: [] as Array<unknown> },
  { name: '2.r', x: 67, y: 32, number: 4, signals: [] as Array<unknown> },
];

class BounceButtonElement extends HTMLElement {
  readonly pinInfo = PIN_INFO;

  private _pressed = false;

  get pressed() {
    return this._pressed;
  }

  // The canvas syncs the stored `pressed` property back onto the element; like
  // wokwi-pushbutton's, setting it redraws without firing press events.
  set pressed(value: boolean) {
    const next = value === true || (value as unknown) === 'true';
    if (next === this._pressed) return;
    this._pressed = next;
    if (this.isConnected) this.render();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.addEventListener('mousedown', this.down);
    this.addEventListener('mouseup', this.up);
    this.addEventListener('mouseleave', this.up);
    this.addEventListener('touchstart', this.down);
    this.addEventListener('touchend', this.up);
  }

  disconnectedCallback() {
    this.removeEventListener('mousedown', this.down);
    this.removeEventListener('mouseup', this.up);
    this.removeEventListener('mouseleave', this.up);
    this.removeEventListener('touchstart', this.down);
    this.removeEventListener('touchend', this.up);
  }

  readonly down = () => {
    if (this._pressed) return;
    this._pressed = true;
    this.render();
    this.dispatchEvent(new Event('button-press'));
  };

  readonly up = () => {
    if (!this._pressed) return;
    this._pressed = false;
    this.render();
    this.dispatchEvent(new Event('button-release'));
  };

  private render() {
    const leg = (x: number, y: number) =>
      `<rect x="${x}" y="${y - 0.3}" width="3" height="0.6" fill="${LEG}"/>`;
    this.shadowRoot!.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; cursor: pointer; }
        svg   { display: block; overflow: visible; }
      </style>
      <svg width="17.802mm" height="12mm" viewBox="-3 0 18 12" xmlns="http://www.w3.org/2000/svg">
        ${leg(-3, 3.44)}${leg(-3, 8.47)}${leg(12, 3.44)}${leg(12, 8.47)}
        <rect x="0" y="0" width="12" height="12" rx="0.44" fill="${BODY}"/>
        <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="0.21" fill="${PLATE}"/>
        <circle cx="1.77" cy="1.79" r="0.37" fill="${CORNER}"/>
        <circle cx="10.16" cy="1.79" r="0.37" fill="${CORNER}"/>
        <circle cx="10.16" cy="10.2" r="0.37" fill="${CORNER}"/>
        <circle cx="1.77" cy="10.2" r="0.37" fill="${CORNER}"/>
        <circle cx="6" cy="6" r="3.82" fill="${this._pressed ? CAP_DOWN : CAP_UP}"
                stroke="${CAP_RIM}" stroke-width="0.12"/>
        <polyline points="3.9,6.6 4.6,5.2 5.3,6.8 6,5 6.7,6.8 7.4,5.2 8.1,6.6"
                  fill="none" stroke="${MARK}" stroke-width="0.28" stroke-linejoin="round"/>
      </svg>`;
  }
}

if (!customElements.get('velxio-bounce-button')) {
  customElements.define('velxio-bounce-button', BounceButtonElement);
}

export { BounceButtonElement };
