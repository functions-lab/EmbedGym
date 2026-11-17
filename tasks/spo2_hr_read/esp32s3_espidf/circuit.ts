import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BIO1', metadataId: 'max32664', x: 400, y: 80 },
];

// SDA -> GPIO38, SCL -> GPIO39, RST -> GPIO4, MFIO -> GPIO5
export const wires: Wire[] = [
  { id: 'w-38-SDA', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-4-RST', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'RST', x: 0, y: 0 }, color: '#aa00aa', waypoints: [] },
  { id: 'w-5-MFIO', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'MFIO', x: 0, y: 0 }, color: '#00aaaa', waypoints: [] },
  { id: 'w-3V3-3V3', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: '3V3', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-BIO1-GND', start: { componentId: 'BIO1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
