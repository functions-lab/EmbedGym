import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'PIR1', metadataId: 'pir-motion-sensor', x: 720, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-P0.28-OUT',
    start: { componentId: 'nrf52840-dk', pinName: 'P0.28', x: 0, y: 0 },
    end: { componentId: 'PIR1', pinName: 'OUT', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-VDD-VCC',
    start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    end: { componentId: 'PIR1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-PIR1-GND',
    start: { componentId: 'PIR1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
