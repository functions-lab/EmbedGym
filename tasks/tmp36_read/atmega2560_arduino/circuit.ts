import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'T1', metadataId: 'tmp36', x: 100, y: 104 },
];

export const wires: Wire[] = [
  {
    id: 'w-A0-Vout',
    start: { componentId: 'arduino-mega', pinName: 'A0',   x: 0, y: 0 },
    end:   { componentId: 'T1',           pinName: 'Vout', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V',  x: 0, y: 0 },
    end:   { componentId: 'T1',           pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-T1-GND',
    start: { componentId: 'T1',           pinName: 'GND', x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
