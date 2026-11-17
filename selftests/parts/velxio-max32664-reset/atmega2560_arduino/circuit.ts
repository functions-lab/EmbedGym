import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'BIO1', metadataId: 'max32664', x: 340, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-20-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-21-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-4-RST',
    start: { componentId: 'arduino-mega', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'RST', x: 0, y: 0 },
    color: '#aa00aa',
    waypoints: [],
  },
  {
    id: 'w-5-MFIO',
    start: { componentId: 'arduino-mega', pinName: '5', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'MFIO', x: 0, y: 0 },
    color: '#00aaaa',
    waypoints: [],
  },
  {
    id: 'w-3V3-3V3',
    start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: '3V3', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BIO1-GND',
    start: { componentId: 'BIO1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
