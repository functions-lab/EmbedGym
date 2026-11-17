import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'IMU1', metadataId: 'mpu6050', x: 760, y: 120 },
];

// i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27
export const wires: Wire[] = [
  { id: 'w-P0.21-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'IMU1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'IMU1', pinName: 'SCL', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-VDD-VCC',   start: { componentId: 'nrf52840-dk', pinName: 'VDD',   x: 0, y: 0 }, end: { componentId: 'IMU1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-IMU1-GND',  start: { componentId: 'IMU1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
