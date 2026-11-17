import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

// Pull-down button: the switch ties P1.11 to VDD, R_PD holds it at GND while
// the switch is open. The resistor is not optional — the solver is the only
// source of an input pin's level, so without it the pin has no idle level.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 720, y: 120 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 810, y: 160 },
];

export const wires: Wire[] = [
  {
    id: 'w-P1.11-BTN',
    start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 },
    end:   { componentId: 'BTN',         pinName: '1.l',   x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-BTN-VDD',
    start: { componentId: 'BTN',         pinName: '2.l', x: 0, y: 0 },
    end:   { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-P1.11-RPD',
    start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 },
    end:   { componentId: 'R_PD',        pinName: '1',     x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-RPD-GND',
    start: { componentId: 'R_PD',        pinName: '2',     x: 0, y: 0 },
    end:   { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
