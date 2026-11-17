import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'DS1', metadataId: 'ds18b20', x: 100, y: 104 },
  { id: 'R_PU', metadataId: 'resistor', x: 180, y: 169, properties: { value: '4700' } },
  { id: 'R1', metadataId: 'resistor', x: 259, y: 169, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 338, y: 130, properties: { color: 'red' } },
  { id: 'BZ1', metadataId: 'buzzer', x: 398, y: 104 },
];

export const wires: Wire[] = [
  {
    id: 'w-4-data',
    start: { componentId: 'arduino-uno', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'data', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-4-RPU',
    start: { componentId: 'arduino-uno', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'R_PU', pinName: '1', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-RPU-5V',
    start: { componentId: 'R_PU', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-DS1-GND',
    start: { componentId: 'DS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-3-R1',
    start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 },
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
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-2-BZ1',
    start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-BZ1-GND',
    start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
