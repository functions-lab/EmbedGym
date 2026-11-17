import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

// Pull-up button: the switch ties pin 2 to GND, R_PU holds it at 5V while the
// switch is open. Correct behaviour is idle HIGH, pressed LOW — from t=0.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 260, y: 100 },
  { id: 'R_PU', metadataId: 'resistor-10k', x: 260, y: 160 },
];

export const wires: Wire[] = [
  { id: 'w-2-BTN',  start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 },
                    end:   { componentId: 'BTN',          pinName: '1.l', x: 0, y: 0 },
                    color: '#ff0000', waypoints: [] },
  { id: 'w-BTN-GND', start: { componentId: 'BTN',          pinName: '2.l', x: 0, y: 0 },
                     end:   { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
  { id: 'w-2-RPU',  start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 },
                    end:   { componentId: 'R_PU',         pinName: '1', x: 0, y: 0 },
                    color: '#ff0000', waypoints: [] },
  { id: 'w-RPU-5V', start: { componentId: 'R_PU',         pinName: '2', x: 0, y: 0 },
                    end:   { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
                    color: '#ff0000', waypoints: [] },
];
