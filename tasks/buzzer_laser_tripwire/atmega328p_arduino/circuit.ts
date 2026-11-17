import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'LZ1', metadataId: 'ky-008', x: 100, y: 120 },
  { id: 'K1', metadataId: 'ky-018-photoresistor', x: 184, y: 120, properties: {} },
  { id: 'BZ1', metadataId: 'buzzer', x: 268, y: 104 },
];

export const wires: Wire[] = [
  { id: 'w-8-signal', start: { componentId: 'arduino-uno', pinName: '8', x: 0, y: 0 }, end: { componentId: 'LZ1', pinName: 'signal', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-5V-LZ1',   start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LZ1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LZ1-GND',  start: { componentId: 'LZ1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-A0-S',     start: { componentId: 'arduino-uno', pinName: 'A0', x: 0, y: 0 }, end: { componentId: 'K1', pinName: 'S', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-K1',    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'K1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-K1-GND',   start: { componentId: 'K1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-3-BZ1',    start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-BZ1-GND',  start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
