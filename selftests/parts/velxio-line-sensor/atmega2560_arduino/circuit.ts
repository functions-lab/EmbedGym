import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 100 } as BoardInstance];

export const components = [
  { id: 'SENSOR', metadataId: 'line-sensor', x: 550, y: 80 }
];

export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '24', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '25', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'SENSOR', pinName: 'R', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '26', x: 0, y: 0 }, color: '#4499cc', waypoints: [] }
];
