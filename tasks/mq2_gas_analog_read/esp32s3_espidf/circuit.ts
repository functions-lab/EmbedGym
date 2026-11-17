import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'GAS1', metadataId: 'mq2', x: 320, y: 60 },
  { id: 'R_TOP', metadataId: 'resistor', x: 420, y: 200, properties: { value: '100k' } },
  { id: 'R_BOT', metadataId: 'resistor', x: 420, y: 280, properties: { value: '150k' } },
];

// The 5 V MQ2's AO reaches GPIO4 through a 100k/150k divider (x0.6).
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 }, end: { componentId: 'R_TOP', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w3', start: { componentId: 'R_TOP', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w4', start: { componentId: 'R_BOT', pinName: '1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w5', start: { componentId: 'R_BOT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
];
