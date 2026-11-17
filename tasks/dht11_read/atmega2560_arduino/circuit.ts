import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'D1', metadataId: 'dht11', x: 100, y: 96 },
];

export const wires: Wire[] = [
  {
    id: 'w-14-DATA',
    start: { componentId: 'arduino-mega', pinName: '14', x: 0, y: 0 },
    end: { componentId: 'D1', pinName: 'DATA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'D1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-D1-GND',
    start: { componentId: 'D1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
