import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'TILT1', metadataId: 'ky-020-tilt-switch', x: 320, y: 120 },
];

export const wires: Wire[] = [
  { id: 'w-26-S', start: { componentId: 'arduino-mega', pinName: '26', x: 0, y: 0 }, end: { componentId: 'TILT1', pinName: 'S', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-V', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'TILT1', pinName: 'V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TILT1-G', start: { componentId: 'TILT1', pinName: 'G', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
