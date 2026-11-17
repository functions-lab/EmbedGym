import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 400, y: 380 },
  { id: 'GAS1', metadataId: 'mq2', x: 320, y: 60 },
  { id: 'R_TOP', metadataId: 'resistor', x: 420, y: 200, properties: { value: '100k' } },
  { id: 'R_BOT', metadataId: 'resistor', x: 420, y: 280, properties: { value: '150k' } },
  { id: 'BZ1', metadataId: 'active-buzzer', x: 620, y: 60 },
  { id: 'R_LED', metadataId: 'resistor', x: 620, y: 240, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 740, y: 200, properties: { color: 'red' } },
];

// MLX90614 on GPIO38/39; the 5 V MQ2's AO reaches GPIO4 through a 100k/150k divider (x0.6); buzzer GPIO10; LED GPIO11.
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w1', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w2', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w3', start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w4', start: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w5', start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w6', start: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 }, end: { componentId: 'R_TOP', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w7', start: { componentId: 'R_TOP', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w8', start: { componentId: 'R_BOT', pinName: '1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w9', start: { componentId: 'R_BOT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w10', start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#ff00ff', waypoints: [] },
  { id: 'w11', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w12', start: { componentId: 'esp32-s3', pinName: '11', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w13', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w14', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
