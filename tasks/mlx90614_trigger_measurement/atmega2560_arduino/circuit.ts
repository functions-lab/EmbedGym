import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

// Pull-down trigger, as the task specifies: the switch connects pin 10 to 5V and
// R_PD holds the pin at GND while the switch is open, so idle reads LOW and a
// press reads HIGH.
export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 330, y: 110 },
  { id: 'BTN', metadataId: 'pushbutton', x: 100, y: 135 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 187, y: 169 },
];

export const wires: Wire[] = [
  {
    id: 'w-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-VIN',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GND',
    start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  { id: 'w-10-BTN',  start: { componentId: 'arduino-mega', pinName: '10', x: 0, y: 0 },
                     end:   { componentId: 'BTN',          pinName: '1.l', x: 0, y: 0 },
                     color: '#0000ff', waypoints: [] },
  { id: 'w-BTN-5V',  start: { componentId: 'BTN',          pinName: '2.l', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-10-RPD',  start: { componentId: 'arduino-mega', pinName: '10', x: 0, y: 0 },
                     end:   { componentId: 'R_PD',         pinName: '1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
  { id: 'w-RPD-GND', start: { componentId: 'R_PD',         pinName: '2', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
];
