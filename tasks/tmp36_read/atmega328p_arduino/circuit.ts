import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'T1', metadataId: 'tmp36', x: 100, y: 104 },
];

export const wires: Wire[] = [
  {
    id: 'w-A0-Vout',
    start: { componentId: 'arduino-uno', pinName: 'A0',   x: 0, y: 0 },
    end:   { componentId: 'T1',           pinName: 'Vout', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-uno', pinName: '5V',  x: 0, y: 0 },
    end:   { componentId: 'T1',           pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-T1-GND',
    start: { componentId: 'T1',           pinName: 'GND', x: 0, y: 0 },
    end:   { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
