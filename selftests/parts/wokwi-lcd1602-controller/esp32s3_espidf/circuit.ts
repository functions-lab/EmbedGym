import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'LCD1', metadataId: 'lcd1602', x: 320, y: 60 },
];

// 4-bit HD44780: RS=38, E=39, D4=40, D5=41, D6=42, D7=21.
export const wires: Wire[] = [
  { id: 'w-38-RS', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'RS', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-E',  start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'E',  x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-40-D4', start: { componentId: 'esp32-s3', pinName: '40', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D4', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-41-D5', start: { componentId: 'esp32-s3', pinName: '41', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D5', x: 0, y: 0 }, color: '#8800ff', waypoints: [] },
  { id: 'w-42-D6', start: { componentId: 'esp32-s3', pinName: '42', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D6', x: 0, y: 0 }, color: '#ffcc00', waypoints: [] },
  { id: 'w-21-D7', start: { componentId: 'esp32-s3', pinName: '21', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D7', x: 0, y: 0 }, color: '#888888', waypoints: [] },
  { id: 'w-5V-VDD', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LCD-VSS', start: { componentId: 'LCD1', pinName: 'VSS', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
