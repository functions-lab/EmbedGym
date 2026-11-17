import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'ENV1', metadataId: 'bme280', x: 320, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-52-SCK',
    start: { componentId: 'arduino-mega', pinName: '52', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'SCK', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-50-MISO',
    start: { componentId: 'arduino-mega', pinName: '50', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'MISO', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-51-MOSI',
    start: { componentId: 'arduino-mega', pinName: '51', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'MOSI', x: 0, y: 0 },
    color: '#0066ff',
    waypoints: [],
  },
  {
    id: 'w-53-CS',
    start: { componentId: 'arduino-mega', pinName: '53', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'CS', x: 0, y: 0 },
    color: '#aa00aa',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-ENV1-GND',
    start: { componentId: 'ENV1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
