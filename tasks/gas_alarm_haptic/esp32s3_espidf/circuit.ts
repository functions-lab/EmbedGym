import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'GAS1', metadataId: 'mq2', x: 320, y: 60 },
  { id: 'R_TOP', metadataId: 'resistor', x: 420, y: 200, properties: { value: '100k' } },
  { id: 'R_BOT', metadataId: 'resistor', x: 420, y: 280, properties: { value: '150k' } },
  { id: 'LS1', metadataId: 'level-shifter', x: 220, y: 260 },
  { id: 'HAP1', metadataId: 'drv2605l', x: 560, y: 320 },
  { id: 'R_LED', metadataId: 'resistor', x: 600, y: 200, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 720, y: 120, properties: { color: 'red' } },
];

// The 5 V MQ2's AO reaches GPIO4 through a 100k/150k divider (x0.6); DO reaches GPIO5 through LS1 channel 1.
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 }, end: { componentId: 'R_TOP', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w3', start: { componentId: 'R_TOP', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w4', start: { componentId: 'R_BOT', pinName: '1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w5', start: { componentId: 'R_BOT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w6', start: { componentId: 'GAS1', pinName: 'DO', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w7', start: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w8', start: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w9', start: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w10', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w11', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'HAP1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w12', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'HAP1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w13', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'HAP1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w14', start: { componentId: 'HAP1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w15', start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w16', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w17', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#333333', waypoints: [] },
];
