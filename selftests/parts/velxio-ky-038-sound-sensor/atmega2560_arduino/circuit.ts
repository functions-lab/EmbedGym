import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'MIC1', metadataId: 'ky-038-sound-sensor', x: 320, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-7-D0',
    start: { componentId: 'arduino-mega', pinName: '7', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'D0', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-A0-A0',
    start: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'A0', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-MIC1-GND',
    start: { componentId: 'MIC1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
