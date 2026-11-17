import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RTC1', metadataId: 'ds1307', x: 760, y: 120 },
  { id: 'LS1', metadataId: 'level-shifter', x: 640, y: 250 },
];

// i2c0 per the overlay's PSEL cells, through LS1 channels 1 and 2:
// SDA = P0.21, SCL = P0.27
export const wires: Wire[] = [
  { id: 'w-P0.21-LV1', start: { componentId: 'nrf52840-dk', pinName: 'P0.21', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-HV1-SDA',   start: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, end: { componentId: 'RTC1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.27-LV2', start: { componentId: 'nrf52840-dk', pinName: 'P0.27', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-HV2-SCL',   start: { componentId: 'LS1', pinName: 'HV2', x: 0, y: 0 }, end: { componentId: 'RTC1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-HV',     start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-VDD-LV',    start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-LS1-GND',   start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-5V-5V',     start: { componentId: 'nrf52840-dk', pinName: '5V',    x: 0, y: 0 }, end: { componentId: 'RTC1', pinName: '5V',  x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RTC1-GND',  start: { componentId: 'RTC1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
