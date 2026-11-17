import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'TDS1', metadataId: 'sen0244', x: 320, y: 30 },
  { id: 'R_LED', metadataId: 'resistor', x: 560, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 670, y: 90, properties: { color: 'red' } },
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
  {
    id: 'w-12-R_LED',
    start: { componentId: 'arduino-mega', pinName: '12', x: 0, y: 0 },
    end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 },
    color: '#ff8800',
    waypoints: [],
  },
  {
    id: 'w-R_LED-L1',
    start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#ff8800',
    waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
