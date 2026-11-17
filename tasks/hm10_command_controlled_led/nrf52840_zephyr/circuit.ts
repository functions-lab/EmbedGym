import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BLE1', metadataId: 'hm10', x: 760, y: 120 },
  { id: 'R_LED', metadataId: 'resistor', x: 760, y: 340, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 880, y: 300, properties: { color: 'red' } },
];

// uart1 per the overlay's PSEL cells: RXD = P1.01 takes TXD, TXD = P1.02 feeds RXD; the LED on P1.15.
export const wires: Wire[] = [
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'BLE1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.01-TXD', start: { componentId: 'nrf52840-dk', pinName: 'P1.01', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'TXD', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P1.02-RXD', start: { componentId: 'nrf52840-dk', pinName: 'P1.02', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'RXD', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P1.15-R_LED', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'w-R_LED-L1', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'w-L1-GND', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
