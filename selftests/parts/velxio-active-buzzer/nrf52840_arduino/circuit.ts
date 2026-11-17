import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'BZ1', metadataId: 'active-buzzer', x: 720, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-P1.15-BZ1',
    start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 },
    end:   { componentId: 'BZ1',         pinName: '1',     x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BZ1-GND',
    start: { componentId: 'BZ1',         pinName: '2',     x: 0, y: 0 },
    end:   { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
