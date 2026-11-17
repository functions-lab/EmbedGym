import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'GAUGE1', metadataId: 'max17048', x: 760, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 760, y: 240 },
  { id: 'R_LED', metadataId: 'resistor', x: 900, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 1000, y: 120, properties: { color: 'red' } },
];

// i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27; buzzer per the my-buzzer gpios cell: P1.15; LED per the my-led gpios cell: P1.12
export const wires: Wire[] = [
  { id: 'w-P0.21-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'GAUGE1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'GAUGE1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-VIN',   start: { componentId: 'nrf52840-dk', pinName: 'VDD',   x: 0, y: 0 }, end: { componentId: 'GAUGE1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GAUGE1-GND', start: { componentId: 'GAUGE1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-BZ1', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-BZ1-GND',   start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.12-R_LED', start: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-R_LED-L1',  start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-L1-GND',    start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
