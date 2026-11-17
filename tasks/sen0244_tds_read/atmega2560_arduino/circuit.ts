import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'TDS1', metadataId: 'sen0244', x: 320, y: 30 },
];

export const wires: Wire[] = [
  {
    id: 'w-A0-signal',
    start: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 },
    end: { componentId: 'TDS1', pinName: 'signal', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-plus',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'TDS1', pinName: '+', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-TDS1-minus',
    start: { componentId: 'TDS1', pinName: '−', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
