import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DS1', metadataId: 'ds18b20', x: 720, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-P0.03-data',
    start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'data', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-VDD-VCC',
    start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-DS1-GND',
    start: { componentId: 'DS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
