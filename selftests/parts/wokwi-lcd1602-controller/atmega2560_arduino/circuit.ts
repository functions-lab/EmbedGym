import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'LCD1', metadataId: 'lcd1602', x: 100, y: 44 },
];

// 4-bit HD44780: RS=48, E=49, D4=46, D5=47, D6=44, D7=45
export const wires: Wire[] = [
  { id: 'w-48-RS', start: { componentId: 'arduino-mega', pinName: '48', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'RS', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-49-E',  start: { componentId: 'arduino-mega', pinName: '49', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'E',  x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-46-D4', start: { componentId: 'arduino-mega', pinName: '46', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D4', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-47-D5', start: { componentId: 'arduino-mega', pinName: '47', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D5', x: 0, y: 0 }, color: '#8800ff', waypoints: [] },
  { id: 'w-44-D6', start: { componentId: 'arduino-mega', pinName: '44', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D6', x: 0, y: 0 }, color: '#ffcc00', waypoints: [] },
  { id: 'w-45-D7', start: { componentId: 'arduino-mega', pinName: '45', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D7', x: 0, y: 0 }, color: '#888888', waypoints: [] },
  { id: 'w-5V-VDD', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LCD-VSS', start: { componentId: 'LCD1', pinName: 'VSS', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
