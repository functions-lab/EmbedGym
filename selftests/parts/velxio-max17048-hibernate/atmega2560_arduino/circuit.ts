import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 220 } as BoardInstance,
];

export const components = [
  { id: 'CELL1', metadataId: 'max17048', x: 330, y: 110, properties: { batteryConnected: true } },
];

export const wires: Wire[] = [
  { id: 'sda', start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'scl', start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'vin', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'gnd', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'int', start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'qstart', start: { componentId: 'arduino-mega', pinName: '3', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'QStart', x: 0, y: 0 }, color: '#8844ff', waypoints: [] },
];
