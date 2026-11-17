import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'H1', metadataId: 'dht11', x: 400, y: 80 },
];

// DATA -> GPIO4
export const wires: Wire[] = [
  {
    id: 'w-4-DATA',
    start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'H1', pinName: 'DATA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-3V3-VCC',
    start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
    end: { componentId: 'H1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-H1-GND',
    start: { componentId: 'H1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
