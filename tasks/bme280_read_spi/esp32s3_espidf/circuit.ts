import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'ENV1', metadataId: 'bme280', x: 400, y: 80 },
];

// SCK -> GPIO38, MISO -> GPIO40, MOSI -> GPIO39, CS -> GPIO41
export const wires: Wire[] = [
  { id: 'w-38-SCK', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'SCK', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-40-MISO', start: { componentId: 'esp32-s3', pinName: '40', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'MISO', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-MOSI', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'MOSI', x: 0, y: 0 }, color: '#0066ff', waypoints: [] },
  { id: 'w-41-CS', start: { componentId: 'esp32-s3', pinName: '41', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'CS', x: 0, y: 0 }, color: '#aa00aa', waypoints: [] },
  { id: 'w-3V3-VCC', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-ENV1-GND', start: { componentId: 'ENV1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
