import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TDS1', metadataId: 'sen0244', x: 300, y: 20 },
  { id: 'R_LED', metadataId: 'resistor', x: 300, y: 260, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 420, y: 220, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  {
    id: 'w-9-signal',
    start: { componentId: 'esp32-s3', pinName: '9', x: 0, y: 0 },
    end: { componentId: 'TDS1', pinName: 'signal', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-3V3-plus',
    start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
    end: { componentId: 'TDS1', pinName: '+', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-TDS1-minus',
    start: { componentId: 'TDS1', pinName: '−', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-10-R_LED',
    start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 },
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
    end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
