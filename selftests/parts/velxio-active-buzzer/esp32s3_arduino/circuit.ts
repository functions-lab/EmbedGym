import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BZ1', metadataId: 'active-buzzer', x: 320, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-10-BZ1',
    start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 },
    end:   { componentId: 'BZ1',      pinName: '1',  x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BZ1-GND',
    start: { componentId: 'BZ1',      pinName: '2',     x: 0, y: 0 },
    end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
