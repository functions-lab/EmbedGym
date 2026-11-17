import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'D1', metadataId: 'dht11', x: 100, y: 96 },
  { id: 'IR1', metadataId: 'mlx90614', x: 330, y: 110 },
  { id: 'R_LED', metadataId: 'resistor', x: 560, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 670, y: 90, properties: { color: 'red' } },
];

// DHT11 DATA on D2; MLX90614 SDA/SCL on A4/A5; LED on D3
export const wires: Wire[] = [
  { id: 'w-2-DATA', start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 }, end: { componentId: 'D1', pinName: 'DATA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-5V-VCC', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'D1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-D1-GND', start: { componentId: 'D1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-A4-SDA', start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-A5-SCL', start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-VIN', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-IR1-GND', start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-3-R_LED', start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-R_LED-L1', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-L1-GND', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
