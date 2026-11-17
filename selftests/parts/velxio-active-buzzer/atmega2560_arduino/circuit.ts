import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'BZ1', metadataId: 'active-buzzer', x: 100, y: 100 },
];

export const wires: Wire[] = [
  {
    id: 'w-9-BZ1',
    start: { componentId: 'arduino-mega', pinName: '9', x: 0, y: 0 },
    end:   { componentId: 'BZ1',          pinName: '1', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BZ1-GND',
    start: { componentId: 'BZ1',          pinName: '2',   x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
