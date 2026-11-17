import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'BIO1', metadataId: 'max32664', x: 340, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-A4-SDA',
    start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-A5-SCL',
    start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-4-RST',
    start: { componentId: 'arduino-uno', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'RST', x: 0, y: 0 },
    color: '#aa00aa',
    waypoints: [],
  },
  {
    id: 'w-5-MFIO',
    start: { componentId: 'arduino-uno', pinName: '5', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: 'MFIO', x: 0, y: 0 },
    color: '#00aaaa',
    waypoints: [],
  },
  {
    id: 'w-3V3-3V3',
    start: { componentId: 'arduino-uno', pinName: '3.3V', x: 0, y: 0 },
    end: { componentId: 'BIO1', pinName: '3V3', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BIO1-GND',
    start: { componentId: 'BIO1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
