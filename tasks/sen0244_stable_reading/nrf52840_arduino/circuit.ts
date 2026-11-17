import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TDS1', metadataId: 'sen0244', x: 760, y: 120 },
];

// signal on P0.03 = AIN1
export const wires: Wire[] = [
  { id: 'w-P0.03-signal', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'TDS1', pinName: 'signal', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-VDD-plus',     start: { componentId: 'nrf52840-dk', pinName: 'VDD',   x: 0, y: 0 }, end: { componentId: 'TDS1', pinName: '+',      x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TDS1-minus',   start: { componentId: 'TDS1', pinName: '−', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
