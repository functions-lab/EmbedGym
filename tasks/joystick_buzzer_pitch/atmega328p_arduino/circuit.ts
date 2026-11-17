import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'JOY1', metadataId: 'joystick', x: 200, y: 60 },
  { id: 'BZ1', metadataId: 'buzzer', x: 340, y: 60 },
];

export const wires: Wire[] = [
  { id: 'w-A0-VRy', start: { componentId: 'arduino-uno', pinName: 'A0', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRy', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-JOY', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-JOY-GND', start: { componentId: 'JOY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-3-BZ1', start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-BZ1-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
