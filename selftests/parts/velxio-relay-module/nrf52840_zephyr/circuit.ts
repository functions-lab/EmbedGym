import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RLY1', metadataId: 'relay-module', x: 720, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-P1.15-IN',
    start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 },
    end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RLY1-GND',
    start: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
