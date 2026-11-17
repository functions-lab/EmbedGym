import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

// Per the overlay's gpios cells: PIR OUT = P0.28, buzzer = P1.15
export const components = [
  { id: 'PIR', metadataId: 'pir-motion-sensor', x: 720, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 890, y: 90 },
];

export const wires: Wire[] = [
  { id: 'w-P0.28-OUT', start: { componentId: 'nrf52840-dk', pinName: 'P0.28', x: 0, y: 0 }, end: { componentId: 'PIR', pinName: 'OUT', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-VCC', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'PIR', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIR-GND', start: { componentId: 'PIR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-BZ1', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-BZ1-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
