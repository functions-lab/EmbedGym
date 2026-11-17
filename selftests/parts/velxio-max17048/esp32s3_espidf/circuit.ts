import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'CELL1', metadataId: 'max17048', x: 400, y: 80, properties: { batteryConnected: true } },
];

// SDA -> GPIO38, SCL -> GPIO39, INT -> GPIO4, QStart -> GPIO5
export const wires: Wire[] = [
  { id: 'w-38-SDA', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-4-INT', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-5-QStart', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'CELL1', pinName: 'QStart', x: 0, y: 0 }, color: '#8844ff', waypoints: [] },
  { id: 'w-CELL1-GND', start: { componentId: 'CELL1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
