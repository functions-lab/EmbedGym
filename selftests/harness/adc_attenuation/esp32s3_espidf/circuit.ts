import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'T1', metadataId: 'tmp36', x: 300, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-9-Vout',
    start: { componentId: 'esp32-s3', pinName: '9', x: 0, y: 0 },
    end: { componentId: 'T1', pinName: 'Vout', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-3V3-VCC',
    start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
    end: { componentId: 'T1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-T1-GND',
    start: { componentId: 'T1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
