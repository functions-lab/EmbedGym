import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'TOUCH1', metadataId: 'mpr121', x: 320, y: 440 },
  { id: 'RLY1', metadataId: 'relay-module', x: 192, y: 108 },
];

export const wires: Wire[] = [
  { id: 'w-SDA', start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-SCL', start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VIN', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-13', start: { componentId: 'arduino-uno', pinName: '13', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 }, color: '#007acc', waypoints: [] },
  { id: 'w-relay-VCC', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-relay-GND', start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
