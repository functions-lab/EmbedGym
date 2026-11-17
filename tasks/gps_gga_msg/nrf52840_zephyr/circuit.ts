import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'GPS1', metadataId: 'pa1616s', x: 760, y: 120 },
];

// uart1 per the overlay's PSEL cells: RXD = P1.01 takes the module's TX, TXD = P1.02 feeds its RX
export const wires: Wire[] = [
  { id: 'w-P1.01-TX', start: { componentId: 'nrf52840-dk', pinName: 'P1.01', x: 0, y: 0 }, end: { componentId: 'GPS1', pinName: 'TX',  x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P1.02-RX', start: { componentId: 'nrf52840-dk', pinName: 'P1.02', x: 0, y: 0 }, end: { componentId: 'GPS1', pinName: 'RX',  x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-VIN',  start: { componentId: 'nrf52840-dk', pinName: 'VDD',   x: 0, y: 0 }, end: { componentId: 'GPS1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GPS1-GND', start: { componentId: 'GPS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
