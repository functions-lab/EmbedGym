import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'AIR1', metadataId: 'pmsa003i', x: 400, y: 20, properties: {} },
  { id: 'GAS1', metadataId: 'sgp40',    x: 560, y: 20, properties: {} },
];

// One I2C bus: both sensors' SDA -> GPIO38, SCL -> GPIO39
export const wires: Wire[] = [
  { id: 'w-38-AIR1-SDA', start: { componentId: 'esp32-s3', pinName: '38',    x: 0, y: 0 }, end: { componentId: 'AIR1',     pinName: 'SDA',   x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-AIR1-SCL', start: { componentId: 'esp32-s3', pinName: '39',    x: 0, y: 0 }, end: { componentId: 'AIR1',     pinName: 'SCL',   x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-VIN',      start: { componentId: 'esp32-s3', pinName: '5V',    x: 0, y: 0 }, end: { componentId: 'AIR1',     pinName: 'VIN',   x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-AIR1-GND',    start: { componentId: 'AIR1',     pinName: 'GND',   x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-38-GAS1-SDA', start: { componentId: 'esp32-s3', pinName: '38',    x: 0, y: 0 }, end: { componentId: 'GAS1',     pinName: 'SDA',   x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-GAS1-SCL', start: { componentId: 'esp32-s3', pinName: '39',    x: 0, y: 0 }, end: { componentId: 'GAS1',     pinName: 'SCL',   x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN',     start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'GAS1',     pinName: 'VIN',   x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GAS1-GND',    start: { componentId: 'GAS1',     pinName: 'GND',   x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
