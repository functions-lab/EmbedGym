import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'JOY1', metadataId: 'joystick', x: 760, y: 120 },
];

// VRx on P0.03 = AIN1 (channel@1), VRy on P0.04 = AIN2 (channel@2), SW on P1.10
export const wires: Wire[] = [
  { id: 'w-P0.03-VRx', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRx', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-P0.04-VRy', start: { componentId: 'nrf52840-dk', pinName: 'P0.04', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRy', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-P1.10-SW', start: { componentId: 'nrf52840-dk', pinName: 'P1.10', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'SW', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-JOY1-GND', start: { componentId: 'JOY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
