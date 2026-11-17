import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 760, y: 120 },
  { id: 'D1', metadataId: 'dht11', x: 760, y: 320 },
  { id: 'R_LED', metadataId: 'resistor', x: 900, y: 470, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 1010, y: 430, properties: { color: 'red' } },
];

// i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27; DHT11 DATA on P1.02; LED on P1.15
export const wires: Wire[] = [
  { id: 'w-P0.21-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-VIN', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-IR1-GND', start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.02-DATA', start: { componentId: 'nrf52840-dk', pinName: 'P1.02', x: 0, y: 0 }, end: { componentId: 'D1', pinName: 'DATA', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'D1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-D1-GND', start: { componentId: 'D1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-R_LED', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-R_LED-L1', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-L1-GND', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
