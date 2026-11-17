import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'KP1', metadataId: 'membrane-keypad', x: 100, y: 412 },
  { id: 'RLY1', metadataId: 'relay-module', x: 100, y: 108 },
];

// R1-R4 -> D9,D8,D7,D6   C1-C4 -> D5,D4,D3,D2   relay IN -> D13
export const wires: Wire[] = [
  { id: 'w-9-R1', start: { componentId: 'arduino-uno', pinName: '9', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-8-R2', start: { componentId: 'arduino-uno', pinName: '8', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R2', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-7-R3', start: { componentId: 'arduino-uno', pinName: '7', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R3', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-6-R4', start: { componentId: 'arduino-uno', pinName: '6', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5-C1', start: { componentId: 'arduino-uno', pinName: '5', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C1', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-4-C2', start: { componentId: 'arduino-uno', pinName: '4', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3-C3', start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C3', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-2-C4', start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C4', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-13-IN', start: { componentId: 'arduino-uno', pinName: '13', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-RLY', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RLY-GND', start: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
