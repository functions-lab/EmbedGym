import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'GAS1', metadataId: 'mq2', x: 720, y: 60 },
  { id: 'R_TOP', metadataId: 'resistor', x: 820, y: 200, properties: { value: '100k' } },
  { id: 'R_BOT', metadataId: 'resistor', x: 820, y: 280, properties: { value: '150k' } },
  { id: 'LS1', metadataId: 'level-shifter', x: 620, y: 260 },
];

// The 5 V MQ2's AO reaches P0.03 (AIN1) through a 100k/150k divider (x0.6); DO reaches P1.10 through LS1 channel 1.
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'GAS1', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'GAS1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'GAS1', pinName: 'AO', x: 0, y: 0 }, end: { componentId: 'R_TOP', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w3', start: { componentId: 'R_TOP', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w4', start: { componentId: 'R_BOT', pinName: '1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w5', start: { componentId: 'R_BOT', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w6', start: { componentId: 'GAS1', pinName: 'DO', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w7', start: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.10', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w8', start: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w9', start: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w10', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
];
