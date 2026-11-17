import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TOUCH1', metadataId: 'mpr121', x: 760, y: 120 },
  { id: 'R0', metadataId: 'resistor', x: 920, y: 240, properties: { value: '10k' } },
  { id: 'R1', metadataId: 'resistor', x: 920, y: 300, properties: { value: '100k' } },
  { id: 'R2', metadataId: 'resistor', x: 920, y: 360, properties: { value: '10k' } },
  { id: 'R3', metadataId: 'resistor', x: 920, y: 420, properties: { value: '10k' } },
];

// i2c0 per the overlay's PSEL cells: SDA = P0.21, SCL = P0.27; INT per the
// mpr121-int gpios cell. Electrode 4 reaches P1.05 through R0 with R1 to
// ground; 5..11 -> P1.06, P1.07, P1.08, P1.10, P1.11, P1.12, P1.13; R2 pulls
// 6 up to 3Vo, R3 pulls 7 down.
export const wires: Wire[] = [
  { id: 'w-P0.21-SDA', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-SCL', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VDD-VIN', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TOUCH1-GND', start: { componentId: 'TOUCH1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.04-INT', start: { componentId: 'nrf52840-dk', pinName: 'P1.04', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E4-R0', start: { componentId: 'TOUCH1', pinName: '4', x: 0, y: 0 }, end: { componentId: 'R0', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R0-P1.05', start: { componentId: 'R0', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.05', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E4-R1', start: { componentId: 'TOUCH1', pinName: '4', x: 0, y: 0 }, end: { componentId: 'R1', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R1-GND', start: { componentId: 'R1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E5-P1.06', start: { componentId: 'TOUCH1', pinName: '5', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.06', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E6-P1.07', start: { componentId: 'TOUCH1', pinName: '6', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.07', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E7-P1.08', start: { componentId: 'TOUCH1', pinName: '7', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.08', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E8-P1.10', start: { componentId: 'TOUCH1', pinName: '8', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.10', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E9-P1.11', start: { componentId: 'TOUCH1', pinName: '9', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E10-P1.12', start: { componentId: 'TOUCH1', pinName: '10', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E11-P1.13', start: { componentId: 'TOUCH1', pinName: '11', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.13', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E6-R2', start: { componentId: 'TOUCH1', pinName: '6', x: 0, y: 0 }, end: { componentId: 'R2', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R2-3Vo', start: { componentId: 'R2', pinName: '2', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: '3Vo', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E7-R3', start: { componentId: 'TOUCH1', pinName: '7', x: 0, y: 0 }, end: { componentId: 'R3', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R3-GND', start: { componentId: 'R3', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
];
