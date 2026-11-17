import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'B1', metadataId: 'buzzer', x: 100, y: 104 },
];

export const wires: Wire[] = [
  {
    id: 'w-11-B1',
    start: { componentId: 'arduino-mega', pinName: '11', x: 0, y: 0 },
    end:   { componentId: 'B1',           pinName: '1',  x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-B1-GND',
    start: { componentId: 'B1',           pinName: '2',   x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
