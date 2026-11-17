import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'PIR', metadataId: 'pir-motion-sensor', x: 100, y: 88 },
  { id: 'BZ1', metadataId: 'buzzer', x: 211, y: 104 },
];

// PIR signal -> D2, buzzer signal -> D3
export const wires: Wire[] = [
  { id: 'w-PIR-VCC', start: { componentId: 'PIR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIR-OUT', start: { componentId: 'PIR', pinName: 'OUT', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-PIR-GND', start: { componentId: 'PIR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-3-BZ', start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-BZ-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
