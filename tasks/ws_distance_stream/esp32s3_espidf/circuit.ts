import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TOF1', metadataId: 'vl53l0x',  x: 400, y: 80 },
  { id: 'R1',   metadataId: 'resistor', x: 300, y: 240, properties: { value: '220' } },
  { id: 'L1',   metadataId: 'led',      x: 420, y: 220, properties: { color: 'red' } },
  { id: 'W1',   metadataId: 'wifi',     x: 560, y: 320, properties: {} },
];

// VL53L0X SDA -> GPIO38, SCL -> GPIO39; LED on GPIO10 through 220 Ω
export const wires: Wire[] = [
  { id: 'w-38-SDA',   start: { componentId: 'esp32-s3', pinName: '38',    x: 0, y: 0 }, end: { componentId: 'TOF1',     pinName: 'SDA',   x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL',   start: { componentId: 'esp32-s3', pinName: '39',    x: 0, y: 0 }, end: { componentId: 'TOF1',     pinName: 'SCL',   x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN',  start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'TOF1',     pinName: 'VIN',   x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TOF1-GND', start: { componentId: 'TOF1',     pinName: 'GND',   x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-10-R1',    start: { componentId: 'esp32-s3', pinName: '10',    x: 0, y: 0 }, end: { componentId: 'R1',       pinName: '1',     x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-R1-L1',    start: { componentId: 'R1',       pinName: '2',     x: 0, y: 0 }, end: { componentId: 'L1',       pinName: 'A',     x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-L1-GND',   start: { componentId: 'L1',       pinName: 'C',     x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
