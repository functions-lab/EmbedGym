import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'MIC1', metadataId: 'ky-038-sound-sensor', x: 720, y: 120 },
  { id: 'RLY1', metadataId: 'relay-module', x: 720, y: 320 },
];

export const wires: Wire[] = [
  {
    id: 'w-P0.03-D0',
    start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'D0', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-VDD-MIC-VCC',
    start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-MIC-GND',
    start: { componentId: 'MIC1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-P1.15-IN',
    start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 },
    end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-5V-RLY-VCC',
    start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RLY-GND',
    start: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
