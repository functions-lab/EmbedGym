import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 420, y: 80, properties: {'savedMode': 2} },
];

// The castellated pads: UART_TX -> GPIO4 (UART1 RX), UART_RX <- GPIO5 (UART1 TX), GND13.
export const wires: Wire[] = [
  { id: 'w-3V3-VCC', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND13', start: { componentId: 'RADIO', pinName: 'GND13', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-4-UART_TX', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'UART_TX', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5-UART_RX', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'UART_RX', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
];
