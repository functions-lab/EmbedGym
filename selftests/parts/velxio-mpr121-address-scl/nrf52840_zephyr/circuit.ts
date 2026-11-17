import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TOUCH1', metadataId: 'mpr121', x: 760, y: 120 },
];

// i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27; INT per the mpr121-int gpios cell
export const wires: Wire[] = [
  { id: 'strap', start: { componentId: 'TOUCH1', pinName: 'ADDR', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#8855cc', waypoints: [] },
  { id: 'w-P0.21-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-VIN', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TOUCH1-GND', start: { componentId: 'TOUCH1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.04-INT', start: { componentId: 'nrf52840-dk', pinName: 'P1.04', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
];
