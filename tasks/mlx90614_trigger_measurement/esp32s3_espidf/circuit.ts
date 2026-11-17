import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 400, y: 80 },
  { id: 'BTN', metadataId: 'pushbutton', x: 300, y: 260 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 300, y: 350 },
];

export const wires: Wire[] = [
  { id: 'w-38-SDA', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-VIN', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-IR1-GND', start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-12-BTN', start: { componentId: 'esp32-s3', pinName: '12', x: 0, y: 0 }, end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-BTN-3V3', start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-12-RPD', start: { componentId: 'esp32-s3', pinName: '12', x: 0, y: 0 }, end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-RPD-GND', start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
