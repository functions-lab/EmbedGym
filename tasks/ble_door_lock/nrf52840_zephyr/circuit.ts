import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'KP1', metadataId: 'membrane-keypad', x: 60, y: 440 },
  { id: 'RLY1', metadataId: 'relay-module', x: 760, y: 320 },
  { id: 'B1', metadataId: 'ble', x: 760, y: 500, properties: {} },
];

// R1-R4 -> P1.08,P1.01,P1.02,P0.27   C1-C4 -> P0.21,P0.23,P1.14,P1.13   relay IN -> P1.15
export const wires: Wire[] = [
  { id: 'w-P1.08-R1', start: { componentId: 'nrf52840-dk', pinName: 'P1.08', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P1.01-R2', start: { componentId: 'nrf52840-dk', pinName: 'P1.01', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R2', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P1.02-R3', start: { componentId: 'nrf52840-dk', pinName: 'P1.02', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R3', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-R4', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'R4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.21-C1', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C1', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P0.23-C2', start: { componentId: 'nrf52840-dk', pinName: 'P0.23', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P1.14-C3', start: { componentId: 'nrf52840-dk', pinName: 'P1.14', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C3', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P1.13-C4', start: { componentId: 'nrf52840-dk', pinName: 'P1.13', x: 0, y: 0 }, end: { componentId: 'KP1', pinName: 'C4', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P1.15-IN', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-RLY', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RLY-GND', start: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
