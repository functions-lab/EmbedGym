import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'AIR1', metadataId: 'pmsa003i', x: 320, y: 10 },
];

export const wires: Wire[] = [
  {
    id: 'w-20-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'AIR1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-21-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'AIR1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-5V-VIN',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'AIR1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-AIR1-GND',
    start: { componentId: 'AIR1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
