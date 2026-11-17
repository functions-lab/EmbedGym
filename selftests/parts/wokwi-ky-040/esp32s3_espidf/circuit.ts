import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'ENC1', metadataId: 'ky-040', x: 300, y: 120 },
];

// CLK -> GPIO43, DT -> GPIO44 (the UART0 TXD/RXD pads, as the rotary_encoder
// task wires them), SW -> GPIO4
export const wires: Wire[] = [
  { id: 'w-43-CLK', start: { componentId: 'esp32-s3', pinName: '43', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'CLK', x: 0, y: 0 }, color: '#f59e0b', waypoints: [] },
  { id: 'w-44-DT', start: { componentId: 'esp32-s3', pinName: '44', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'DT', x: 0, y: 0 }, color: '#10b981', waypoints: [] },
  { id: 'w-4-SW', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'SW', x: 0, y: 0 }, color: '#3b82f6', waypoints: [] },
  { id: 'w-vcc', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'VCC', x: 0, y: 0 }, color: '#ef4444', waypoints: [] },
  { id: 'w-gnd', start: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
