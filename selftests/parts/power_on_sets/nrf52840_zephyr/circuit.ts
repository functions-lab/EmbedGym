import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 760, y: 120 },
  { id: 'MAG1', metadataId: 'hmc5883l', x: 960, y: 120 },
];

// Shared i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27
export const wires: Wire[] = [
  { id: 'w-P0.21-IR-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-IR-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-IR-VIN', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-IR-GND', start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P0.21-MAG-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'MAG1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-MAG-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'MAG1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-MAG-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'MAG1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-MAG-GND', start: { componentId: 'MAG1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
