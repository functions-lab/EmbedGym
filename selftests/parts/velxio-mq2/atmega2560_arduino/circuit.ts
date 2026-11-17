import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'GAS1', metadataId: 'mq2', x: 320, y: 100 },
];

export const wires: Wire[] = [
  {
    id: 'w-5-DO',
    start: { componentId: 'arduino-mega', pinName: '5', x: 0, y: 0 },
    end: { componentId: 'GAS1', pinName: 'DO', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-A0-AO',
    start: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 },
    end: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-GAS1-GND',
    start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
