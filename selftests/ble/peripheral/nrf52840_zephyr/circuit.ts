import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'R1', metadataId: 'resistor', x: 720, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led',      x: 820, y: 120, properties: { color: 'red' } },
  { id: 'B1', metadataId: 'ble',      x: 720, y: 260, properties: {} },
];

export const wires: Wire[] = [
  {
    id: 'w-P1.15-R1',
    start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 },
    end:   { componentId: 'R1',          pinName: '1',     x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-R1-L1',
    start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end:   { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1',          pinName: 'C',     x: 0, y: 0 },
    end:   { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
