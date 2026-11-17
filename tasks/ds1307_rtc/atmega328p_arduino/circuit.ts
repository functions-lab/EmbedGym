import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'RTC1', metadataId: 'ds1307', x: 320, y: 96 },
];

export const wires: Wire[] = [
  {
    id: 'w-A4-SDA',
    start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 },
    end: { componentId: 'RTC1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-A5-SCL',
    start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 },
    end: { componentId: 'RTC1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-5V-5V',
    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'RTC1', pinName: '5V', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RTC1-GND',
    start: { componentId: 'RTC1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
