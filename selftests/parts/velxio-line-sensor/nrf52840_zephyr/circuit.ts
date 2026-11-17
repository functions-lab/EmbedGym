import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'SENSOR', metadataId: 'line-sensor', x: 720, y: 60 },
  { id: 'LS1', metadataId: 'level-shifter', x: 620, y: 260 },
];

// The 5 V sensor's L/M/R reach P1.10..P1.12 through LS1 channels 1..3.
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'SENSOR', pinName: 'R', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.10', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'LS1', pinName: 'LV2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'LS1', pinName: 'LV3', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w9', start: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w10', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
];
