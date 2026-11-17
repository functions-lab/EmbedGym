import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BIO1', metadataId: 'max32664', x: 760, y: 120 },
  { id: 'B1',   metadataId: 'ble',      x: 760, y: 400, properties: {} },
];

// i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27; RST and MFIO per its gpios cells
export const wires: Wire[] = [
  { id: 'w-P0.21-SDA',  start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'SDA',  x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-SCL',  start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'SCL',  x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P1.12-RST',  start: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'RST',  x: 0, y: 0 }, color: '#aa00aa', waypoints: [] },
  { id: 'w-P1.11-MFIO', start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: 'MFIO', x: 0, y: 0 }, color: '#00aaaa', waypoints: [] },
  { id: 'w-VDD-3V3',    start: { componentId: 'nrf52840-dk', pinName: 'VDD',   x: 0, y: 0 }, end: { componentId: 'BIO1', pinName: '3V3',  x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-BIO1-GND',   start: { componentId: 'BIO1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
