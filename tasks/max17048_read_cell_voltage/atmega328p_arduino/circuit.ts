import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'GAUGE1', metadataId: 'max17048', x: 320, y: 440 },
];

export const wires: Wire[] = [
  {
    id: 'w-SDA',
    start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 },
    end: { componentId: 'GAUGE1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-SCL',
    start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 },
    end: { componentId: 'GAUGE1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-VIN',
    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'GAUGE1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GND',
    start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'GAUGE1', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
];
