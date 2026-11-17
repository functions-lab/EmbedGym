import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

// Pull-up button: the switch ties pin 2 to GND, R_PU holds it at 5V while the
// switch is open. The resistor is not optional — the solver is the only source
// of an input pin's level, so without it the pin has no idle level and reads
// permanently pressed.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 100, y: 135 },
  { id: 'R_PU', metadataId: 'resistor-10k', x: 187, y: 169 },
];

export const wires: Wire[] = [
  {
    id: 'w-2-BTN',
    start: { componentId: 'arduino-mega', pinName: '2',   x: 0, y: 0 },
    end:   { componentId: 'BTN',          pinName: '1.l', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BTN-GND',
    start: { componentId: 'BTN',          pinName: '2.l', x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-2-RPU',
    start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
    end:   { componentId: 'R_PU',         pinName: '1', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RPU-5V',
    start: { componentId: 'R_PU',         pinName: '2',  x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
];
