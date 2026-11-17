import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DS1', metadataId: 'ds18b20', x: 400, y: 80 },
  { id: 'R_PU', metadataId: 'resistor', x: 400, y: 220, properties: { value: '4700' } },
  { id: 'R1', metadataId: 'resistor', x: 400, y: 300, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 520, y: 260, properties: { color: 'red' } },
  { id: 'BZ1', metadataId: 'buzzer', x: 600, y: 80 },
];

// data -> GPIO14 (4.7k pull-up to 3V3), LED -> GPIO10, buzzer -> GPIO11
export const wires: Wire[] = [
  {
    id: 'w-14-data',
    start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'data', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-14-RPU',
    start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
    end: { componentId: 'R_PU', pinName: '1', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-RPU-3V3',
    start: { componentId: 'R_PU', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-3V3-VCC',
    start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-DS1-GND',
    start: { componentId: 'DS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-10-R1',
    start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 },
    end: { componentId: 'R1', pinName: '1', x: 0, y: 0 },
    color: '#ff8800',
    waypoints: [],
  },
  {
    id: 'w-R1-L1',
    start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#ff8800',
    waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-11-BZ1',
    start: { componentId: 'esp32-s3', pinName: '11', x: 0, y: 0 },
    end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-BZ1-GND',
    start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
