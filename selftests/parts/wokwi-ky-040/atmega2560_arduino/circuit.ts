import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'ENC1', metadataId: 'ky-040', x: 340, y: 120 },
];

// CLK -> 2, DT -> 3, SW -> 4
export const wires: Wire[] = [
  { id: 'w-2-CLK', start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'CLK', x: 0, y: 0 }, color: '#f59e0b', waypoints: [] },
  { id: 'w-3-DT', start: { componentId: 'arduino-mega', pinName: '3', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'DT', x: 0, y: 0 }, color: '#10b981', waypoints: [] },
  { id: 'w-4-SW', start: { componentId: 'arduino-mega', pinName: '4', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'SW', x: 0, y: 0 }, color: '#3b82f6', waypoints: [] },
  { id: 'w-vcc', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'VCC', x: 0, y: 0 }, color: '#ef4444', waypoints: [] },
  { id: 'w-gnd', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
