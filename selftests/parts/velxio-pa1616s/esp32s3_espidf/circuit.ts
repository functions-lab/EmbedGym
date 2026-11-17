import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'GPS1', metadataId: 'pa1616s', x: 400, y: 80 },
];

// GPS TX -> GPIO4 (board UART RX), GPS RX -> GPIO5 (board UART TX): plain
// matrix-routed GPIOs, not the UART1 IO_MUX pads 17/18.
export const wires: Wire[] = [
  { id: 'w-4-TX', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'GPS1', pinName: 'TX', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5-RX', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'GPS1', pinName: 'RX', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'GPS1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GPS1-GND', start: { componentId: 'GPS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
