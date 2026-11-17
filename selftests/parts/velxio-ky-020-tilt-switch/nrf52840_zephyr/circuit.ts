import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TILT1', metadataId: 'ky-020-tilt-switch', x: 720, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-P0.04-S',
    start: { componentId: 'nrf52840-dk', pinName: 'P0.04', x: 0, y: 0 },
    end: { componentId: 'TILT1', pinName: 'S', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-VDD-V',
    start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    end: { componentId: 'TILT1', pinName: 'V', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-TILT1-G',
    start: { componentId: 'TILT1', pinName: 'G', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
