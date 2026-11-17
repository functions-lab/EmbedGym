import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'TOUCH1', metadataId: 'mpr121', x: 350, y: 95 },
];

export const wires: Wire[] = [
  { id: 'floating-ground', start: { componentId: 'TOUCH1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'INT', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-SDA', start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-SCL', start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VIN', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-INT', start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
];
