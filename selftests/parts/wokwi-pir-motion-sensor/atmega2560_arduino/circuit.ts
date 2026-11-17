import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'PIR1', metadataId: 'pir-motion-sensor', x: 100, y: 88 },
];

export const wires: Wire[] = [
  { id: 'w-24-OUT', start: { componentId: 'arduino-mega', pinName: '24', x: 0, y: 0 }, end: { componentId: 'PIR1', pinName: 'OUT', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-VCC', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'PIR1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIR1-GND', start: { componentId: 'PIR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
