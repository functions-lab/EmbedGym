import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

// Pull-down button: the switch ties pin 2 to 5V, R_PD holds it at GND while
// the switch is open, so a press reads HIGH.
export const components = [
  { id: 'BTN', metadataId: 'bounce-button', x: 100, y: 135 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 187, y: 169 },
];

export const wires: Wire[] = [
  { id: 'w-2-BTN',   start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
                     end:   { componentId: 'BTN',          pinName: '1.l', x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-BTN-5V',  start: { componentId: 'BTN',          pinName: '2.l', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-2-RPD',   start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
                     end:   { componentId: 'R_PD',         pinName: '1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
  { id: 'w-RPD-GND', start: { componentId: 'R_PD',         pinName: '2', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
];
