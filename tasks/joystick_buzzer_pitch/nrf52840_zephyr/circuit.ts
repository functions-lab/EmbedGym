import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'JOY1', metadataId: 'joystick', x: 720, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 920, y: 104 },
];

// X = io-channel 0 = channel@2, input-positive <2> = AIN1 = P0.03
// Y = io-channel 1 = channel@3, input-positive <3> = AIN2 = P0.04
export const wires: Wire[] = [
  { id: 'w-P0.03-VRx', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRx', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-P0.04-VRy', start: { componentId: 'nrf52840-dk', pinName: 'P0.04', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VRy', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-VDD-JOY', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'JOY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-JOY-GND', start: { componentId: 'JOY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-BZ1', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-BZ1-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
