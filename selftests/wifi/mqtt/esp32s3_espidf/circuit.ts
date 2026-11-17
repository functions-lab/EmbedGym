import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'R1', metadataId: 'resistor', x: 300, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led',      x: 400, y: 120, properties: { color: 'green' } },
  { id: 'W1', metadataId: 'wifi',     x: 300, y: 260, properties: {} },
];

export const wires: Wire[] = [
  {
    id: 'w-10-R1',
    start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 },
    end:   { componentId: 'R1',       pinName: '1',  x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-R1-L1',
    start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end:   { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1',       pinName: 'C',     x: 0, y: 0 },
    end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
