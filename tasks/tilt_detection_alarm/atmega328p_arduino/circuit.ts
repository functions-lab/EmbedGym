import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'TILT1', metadataId: 'ky-020-tilt-switch', x: 100, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 184, y: 104 },
];

// tilt S -> D2, buzzer signal -> D13
export const wires: Wire[] = [
  { id: 'w-2-S', start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 }, end: { componentId: 'TILT1', pinName: 'S', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-V', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'TILT1', pinName: 'V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TILT1-G', start: { componentId: 'TILT1', pinName: 'G', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-13-BZ', start: { componentId: 'arduino-uno', pinName: '13', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-BZ-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
