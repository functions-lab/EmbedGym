import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'US1', metadataId: 'hc-sr04', x: 100, y: 86 },
];

export const wires: Wire[] = [
  {
    id: 'w-23-TRIG',
    start: { componentId: 'arduino-mega', pinName: '23', x: 0, y: 0 },
    end: { componentId: 'US1', pinName: 'TRIG', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-22-ECHO',
    start: { componentId: 'arduino-mega', pinName: '22', x: 0, y: 0 },
    end: { componentId: 'US1', pinName: 'ECHO', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'US1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-US1-GND',
    start: { componentId: 'US1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
