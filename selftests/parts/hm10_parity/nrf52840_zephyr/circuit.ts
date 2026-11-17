import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 760, y: 120, properties: {'savedMode': 2} },
];

// The castellated pads on uart1: UART_TX -> P1.01 (RXD), UART_RX <- P1.02 (TXD), GND13.
export const wires: Wire[] = [
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND13', start: { componentId: 'RADIO', pinName: 'GND13', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.01-UART_TX', start: { componentId: 'nrf52840-dk', pinName: 'P1.01', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'UART_TX', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P1.02-UART_RX', start: { componentId: 'nrf52840-dk', pinName: 'P1.02', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'UART_RX', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
];
