import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'MIC1', metadataId: 'ky-038-sound-sensor', x: 720, y: 120 },
];

// D0 on P1.10; A0 on P0.03 = AIN1, the overlay's channel@1
export const wires: Wire[] = [
  { id: 'w-P1.10-D0', start: { componentId: 'nrf52840-dk', pinName: 'P1.10', x: 0, y: 0 }, end: { componentId: 'MIC1', pinName: 'D0', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-P0.03-A0', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'MIC1', pinName: 'A0', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'MIC1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-MIC1-GND', start: { componentId: 'MIC1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
