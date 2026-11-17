import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'D1', metadataId: 'dht11', x: 100, y: 96 },
  { id: 'IR1', metadataId: 'mlx90614', x: 330, y: 110 },
  { id: 'R_LED', metadataId: 'resistor', x: 560, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 670, y: 90, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  {
    id: 'w-8-DATA',
    start: { componentId: 'arduino-mega', pinName: '8', x: 0, y: 0 },
    end: { componentId: 'D1', pinName: 'DATA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'D1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-D1-GND',
    start: { componentId: 'D1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-VIN',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-IR1-GND',
    start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 },
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
