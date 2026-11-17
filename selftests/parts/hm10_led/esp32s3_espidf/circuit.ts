import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 420, y: 80 },
  { id: 'LIMIT', metadataId: 'resistor', x: 560, y: 300, properties: {'value': '220'} },
  { id: 'LED', metadataId: 'led', x: 680, y: 260, properties: {'color': 'red'} },
];

// HM-10 TXD -> GPIO4 (UART1 RX), RXD <- GPIO5 (UART1 TX); the LED on GPIO10.
export const wires: Wire[] = [
  { id: 'w-3V3-VCC', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'RADIO', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-4-TXD', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'TXD', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5-RXD', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'RXD', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-10-LIMIT', start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 }, end: { componentId: 'LIMIT', pinName: '1', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'w-LIMIT-LED', start: { componentId: 'LIMIT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'LED', pinName: 'A', x: 0, y: 0 }, color: '#008800', waypoints: [] },
  { id: 'w-LED-GND', start: { componentId: 'LED', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
