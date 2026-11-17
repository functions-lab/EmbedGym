import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'LZ1', metadataId: 'ky-008', x: 720, y: 120 },
  { id: 'K1', metadataId: 'ky-018-photoresistor', x: 804, y: 120, properties: {} },
  { id: 'BZ1', metadataId: 'buzzer', x: 888, y: 104 },
];

// S on P0.03 = AIN1: the overlay's channel@2 has zephyr,input-positive = <2> = NRF_SAADC_AIN1
export const wires: Wire[] = [
  { id: 'w-P1.12-signal', start: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 }, end: { componentId: 'LZ1', pinName: 'signal', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-5V-LZ1', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LZ1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LZ1-GND', start: { componentId: 'LZ1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P0.03-S', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'K1', pinName: 'S', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-VDD-K1', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'K1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-K1-GND', start: { componentId: 'K1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-BZ1', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 }, end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-BZ1-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
