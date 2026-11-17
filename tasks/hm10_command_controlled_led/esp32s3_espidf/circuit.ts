import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BLE1', metadataId: 'hm10', x: 420, y: 80 },
  { id: 'R_LED', metadataId: 'resistor', x: 560, y: 300, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 680, y: 260, properties: { color: 'red' } },
];

// HM-10 TXD -> GPIO4 (UART1 RX), RXD <- GPIO5 (UART1 TX); the LED on GPIO10.
export const wires: Wire[] = [
  { id: 'w-3V3-VCC', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'BLE1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-4-TXD', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'TXD', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5-RXD', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'BLE1', pinName: 'RXD', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-10-R_LED', start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'w-R_LED-L1', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'w-L1-GND', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
