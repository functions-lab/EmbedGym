import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'AIR1', metadataId: 'pmsa003i',     x: 400, y: 80,  properties: {} },
  { id: 'RLY1', metadataId: 'relay-module', x: 300, y: 320 },
  { id: 'W1',   metadataId: 'wifi',         x: 560, y: 320, properties: {} },
];

// PMSA003I SDA -> GPIO38, SCL -> GPIO39; Relay IN -> GPIO21
export const wires: Wire[] = [
  { id: 'w-38-SDA',     start: { componentId: 'esp32-s3', pinName: '38',    x: 0, y: 0 }, end: { componentId: 'AIR1',     pinName: 'SDA',   x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL',     start: { componentId: 'esp32-s3', pinName: '39',    x: 0, y: 0 }, end: { componentId: 'AIR1',     pinName: 'SCL',   x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-VIN',     start: { componentId: 'esp32-s3', pinName: '5V',    x: 0, y: 0 }, end: { componentId: 'AIR1',     pinName: 'VIN',   x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-AIR1-GND',   start: { componentId: 'AIR1',     pinName: 'GND',   x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-21-IN',      start: { componentId: 'esp32-s3', pinName: '21',    x: 0, y: 0 }, end: { componentId: 'RLY1',     pinName: 'IN',    x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5V-RLY-VCC', start: { componentId: 'esp32-s3', pinName: '5V',    x: 0, y: 0 }, end: { componentId: 'RLY1',     pinName: 'VCC',   x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RLY-GND',    start: { componentId: 'RLY1',     pinName: 'GND',   x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
