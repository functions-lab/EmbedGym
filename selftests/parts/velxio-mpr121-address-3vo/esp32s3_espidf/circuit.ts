import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TOUCH1', metadataId: 'mpr121', x: 400, y: 80 },
];

// SDA -> GPIO38, SCL -> GPIO39, INT -> GPIO4
export const wires: Wire[] = [
  { id: 'strap', start: { componentId: 'TOUCH1', pinName: 'ADDR', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: '3Vo', x: 0, y: 0 }, color: '#8855cc', waypoints: [] },
  { id: 'w-38-SDA', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TOUCH1-GND', start: { componentId: 'TOUCH1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-4-INT', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
];
