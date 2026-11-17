import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RLY1', metadataId: 'relay-module', x: 320, y: 60 },
];

export const wires: Wire[] = [
  {
    id: 'w-10-IN',
    start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 },
    end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RLY1-GND',
    start: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
