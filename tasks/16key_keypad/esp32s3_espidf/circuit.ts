import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'KP1', metadataId: 'membrane-keypad', x: 300, y: 60 },
];

// R1-R4 -> GPIO38/39/21/14, C1-C4 -> GPIO10/9/41/40 (the 16key_keypad pinout)
export const wires: Wire[] = [
  { id: 'w-38-R1', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-R2', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R2', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-21-R3', start: { componentId: 'esp32-s3', pinName: '21', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R3', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-14-R4', start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-10-C1', start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C1', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-9-C2', start: { componentId: 'esp32-s3', pinName: '9', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-41-C3', start: { componentId: 'esp32-s3', pinName: '41', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C3', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-40-C4', start: { componentId: 'esp32-s3', pinName: '40', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C4', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
];
