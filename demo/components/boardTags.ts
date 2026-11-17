// The element that draws each board. The React wrappers position themselves
// absolutely, so previews render the underlying element and lay it out.
// Some elements serve several boards via an attribute (every ESP is one
// `velxio-esp32`). Only the testbench's target boards need an entry.

export interface BoardElement {
  tag: string;
  attrs?: Record<string, string>;
}

export const BOARD_ELEMENT: Record<string, BoardElement> = {
  'arduino-mega': { tag: 'wokwi-arduino-mega' },
  'arduino-uno': { tag: 'wokwi-arduino-uno' },
  'arduino-nano': { tag: 'wokwi-arduino-nano' },
  'esp32-s3': { tag: 'velxio-esp32', attrs: { boardKind: 'esp32-s3' } },
  'nrf52840-dk': { tag: 'velxio-nrf52840-dk' },
};

export function boardElement(boardKind: string): BoardElement {
  const element = BOARD_ELEMENT[boardKind];
  if (!element) throw new Error(`no preview element for boardKind '${boardKind}'`);
  return element;
}
