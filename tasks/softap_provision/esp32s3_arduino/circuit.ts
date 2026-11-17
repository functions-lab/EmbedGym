import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'LTR1', metadataId: 'ltr390', x: 400, y: 80,  properties: {} },
  { id: 'W1',   metadataId: 'wifi',   x: 300, y: 300, properties: {} },
];

// LTR390 SDA -> GPIO38, SCL -> GPIO39
export const wires: Wire[] = [
  { id: 'w-38-SDA',   start: { componentId: 'esp32-s3', pinName: '38',    x: 0, y: 0 }, end: { componentId: 'LTR1',     pinName: 'SDA',   x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL',   start: { componentId: 'esp32-s3', pinName: '39',    x: 0, y: 0 }, end: { componentId: 'LTR1',     pinName: 'SCL',   x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN',  start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'LTR1',     pinName: 'VIN',   x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LTR1-GND', start: { componentId: 'LTR1',     pinName: 'GND',   x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
