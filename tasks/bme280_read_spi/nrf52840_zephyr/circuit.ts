import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'ENV1', metadataId: 'bme280', x: 760, y: 120 },
];

// spi0 per the overlay: SCK = P0.27, MOSI = P0.21, MISO = P0.23, cs-gpios = P1.14
export const wires: Wire[] = [
  { id: 'w-P0.27-SCK',  start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'SCK',  x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-P0.23-MISO', start: { componentId: 'nrf52840-dk', pinName: 'P0.23', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'MISO', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.21-MOSI', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'MOSI', x: 0, y: 0 }, color: '#0066ff', waypoints: [] },
  { id: 'w-P1.14-CS',   start: { componentId: 'nrf52840-dk', pinName: 'P1.14', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'CS',   x: 0, y: 0 }, color: '#aa00aa', waypoints: [] },
  { id: 'w-VDD-VCC',    start: { componentId: 'nrf52840-dk', pinName: 'VDD',   x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'VCC',  x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-ENV1-GND',   start: { componentId: 'ENV1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
