import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];
export const components = [
  { id: 'LIMIT', metadataId: 'resistor', x: 220, y: 60, properties: { value: '220' } },
  { id: 'LED', metadataId: 'led', x: 320, y: 60, properties: { color: 'red' } },
];
export const wires: Wire[] = [
  { id: 'signal', start: { componentId: 'arduino-uno', pinName: '4', x: 0, y: 0 }, end: { componentId: 'LIMIT', pinName: '1', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'limit', start: { componentId: 'LIMIT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'LED', pinName: 'A', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'ground', start: { componentId: 'LED', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
