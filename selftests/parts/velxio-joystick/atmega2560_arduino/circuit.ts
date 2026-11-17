import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'JOY1', metadataId: 'joystick', x: 320, y: 120 },
];

export const wires: Wire[] = [
  { id: 'w-A0-VRx', start: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRx', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-A1-VRy', start: { componentId: 'arduino-mega', pinName: 'A1', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRy', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-7-SW',   start: { componentId: 'arduino-mega', pinName: '7', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'SW', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-VCC', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-JOY-GND', start: { componentId: 'JOY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
