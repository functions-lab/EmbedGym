import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'KP1', metadataId: 'membrane-keypad', x: 60, y: 440 },
  { id: 'RLY1', metadataId: 'relay-module', x: 760, y: 320 },
  { id: 'LCD1', metadataId: 'lcd1602', x: 760, y: 120 },
];

// R1-R4 -> P1.08,P1.01,P1.02,P0.27   C1-C4 -> P0.21,P0.23,P1.14,P1.13   relay IN -> P1.15
// HD44780 4-bit: RS=P0.04, E=P0.05, D4=P0.02, D5=P0.31, D6=P0.29, D7=P0.30
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
  { id: 'w-P0.04-RS', start: { componentId: 'nrf52840-dk', pinName: 'P0.04', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'RS', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.05-E', start: { componentId: 'nrf52840-dk', pinName: 'P0.05', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'E', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-P0.02-D4', start: { componentId: 'nrf52840-dk', pinName: 'P0.02', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D4', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-P0.31-D5', start: { componentId: 'nrf52840-dk', pinName: 'P0.31', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D5', x: 0, y: 0 }, color: '#8800ff', waypoints: [] },
  { id: 'w-P0.29-D6', start: { componentId: 'nrf52840-dk', pinName: 'P0.29', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D6', x: 0, y: 0 }, color: '#ffcc00', waypoints: [] },
  { id: 'w-P0.30-D7', start: { componentId: 'nrf52840-dk', pinName: 'P0.30', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D7', x: 0, y: 0 }, color: '#888888', waypoints: [] },
  { id: 'w-5V-VDD', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LCD-VSS', start: { componentId: 'LCD1', pinName: 'VSS', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
