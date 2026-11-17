import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 960, y: 320 },
  { id: 'GAS1', metadataId: 'mq2', x: 720, y: 60 },
  { id: 'R_TOP', metadataId: 'resistor', x: 820, y: 200, properties: { value: '100k' } },
  { id: 'R_BOT', metadataId: 'resistor', x: 820, y: 280, properties: { value: '150k' } },
  { id: 'BZ1', metadataId: 'active-buzzer', x: 720, y: 420 },
  { id: 'R_LED', metadataId: 'resistor', x: 1000, y: 200, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 1120, y: 120, properties: { color: 'red' } },
];

// i2c0 SDA = P0.21, SCL = P0.27; the 5 V MQ2's AO reaches P0.03 (AIN1) through a 100k/150k divider (x0.6); buzzer P1.15; LED P1.12.
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w1', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w2', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w3', start: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w4', start: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w5', start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w6', start: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 }, end: { componentId: 'R_TOP', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w7', start: { componentId: 'R_TOP', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w8', start: { componentId: 'R_BOT', pinName: '1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w9', start: { componentId: 'R_BOT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w10', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#ff00ff', waypoints: [] },
  { id: 'w11', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w12', start: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 }, end: { componentId: 'R_LED', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w13', start: { componentId: 'R_LED', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w14', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
