import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

// Pull-down button, as the task specifies: the switch connects P1.11 to VDD and
// R_PD holds the pin at GND while the switch is open, so idle reads LOW and a
// press reads HIGH.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 720, y: 120 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 810, y: 160 },
  { id: 'BZ1', metadataId: 'buzzer', x: 890, y: 90 },
  { id: 'R1', metadataId: 'resistor', x: 975, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 1055, y: 120, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  { id: 'w-P1.11-BTN', start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 },
    end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-BTN-VDD', start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-P1.11-RPD', start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 },
    end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-RPD-GND', start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-BZ1', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 },
    end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-BZ1-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.12-R1', start: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 },
    end: { componentId: 'R1', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-R1-L1', start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-L1-GND', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
