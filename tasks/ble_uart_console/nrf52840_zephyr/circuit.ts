import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'T1', metadataId: 'tmp36',    x: 720, y: 320 },
  { id: 'R1', metadataId: 'resistor', x: 720, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led',      x: 820, y: 120, properties: { color: 'red' } },
  { id: 'B1', metadataId: 'ble',      x: 760, y: 500, properties: {} },
];

// Vout on P0.03 = AIN1: the overlay's channel@2 has zephyr,input-positive = <2> = NRF_SAADC_AIN1
export const wires: Wire[] = [
  { id: 'w-P0.03-Vout', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'T1', pinName: 'Vout', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-VDD-VCC',    start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'T1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-T1-GND',     start: { componentId: 'T1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-R1',   start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'R1', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-R1-L1',      start: { componentId: 'R1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-L1-GND',     start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
