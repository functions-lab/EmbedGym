import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BLE1', metadataId: 'hm10', x: 420, y: 80 },
];

// HM-10 TXD -> GPIO4 (UART1 RX), RXD <- GPIO5 (UART1 TX).
export const wires: Wire[] = [
  { id: 'w-3V3-VCC', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'BLE1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-4-TXD', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'TXD', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5-RXD', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'RXD', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
];
