import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'K1', metadataId: 'ky-018-photoresistor', x: 100, y: 120, properties: {} },
  { id: 'R1', metadataId: 'resistor', x: 184, y: 169, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led',      x: 320, y: 120, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  {
    id: 'w-A2-S',
    start: { componentId: 'arduino-mega', pinName: 'A2', x: 0, y: 0 },
    end:   { componentId: 'K1',           pinName: 'S',  x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V',  x: 0, y: 0 },
    end:   { componentId: 'K1',           pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-K1-GND',
    start: { componentId: 'K1',           pinName: 'GND', x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-3-R1',
    start: { componentId: 'arduino-mega', pinName: '3', x: 0, y: 0 },
    end:   { componentId: 'R1',           pinName: '1', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-R1-L1',
    start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end:   { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1',           pinName: 'C',   x: 0, y: 0 },
    end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
