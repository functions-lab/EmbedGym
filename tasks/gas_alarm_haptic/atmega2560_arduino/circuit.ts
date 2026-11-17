import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 260 } as BoardInstance,
];

export const components = [
  { id: 'HAP1', metadataId: 'drv2605l', x: 100, y: 100 },
  { id: 'GAS1', metadataId: 'mq2', x: 320, y: 60 },
  { id: 'R_LED', metadataId: 'resistor', x: 490, y: 190, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 600, y: 120, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  {
    id: 'w-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'HAP1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'HAP1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-HAP-VIN',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'HAP1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-HAP-GND',
    start: { componentId: 'HAP1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-A5-AO',
    start: { componentId: 'arduino-mega', pinName: 'A5', x: 0, y: 0 },
    end: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 },
    color: '#00aaaa', waypoints: [],
  },
  {
    id: 'w-5-DO',
    start: { componentId: 'arduino-mega', pinName: '5', x: 0, y: 0 },
    end: { componentId: 'GAS1', pinName: 'DO', x: 0, y: 0 },
    color: '#0000ff', waypoints: [],
  },
  {
    id: 'w-GAS-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GAS-GND',
    start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-12-resistor',
    start: { componentId: 'arduino-mega', pinName: '12', x: 0, y: 0 },
    end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 },
    color: '#ff8800', waypoints: [],
  },
  {
    id: 'w-resistor-LED',
    start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#ff8800', waypoints: [],
  },
  {
    id: 'w-LED-GND',
    start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
];
