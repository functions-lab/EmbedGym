import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

// R_PD holds pin 2 at GND while the switch is open, so idle reads LOW and a
// press (which connects the pin to 5V) reads HIGH.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 100, y: 135 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 187, y: 169 },
  { id: 'BZ1', metadataId: 'buzzer', x: 266, y: 104 },
  { id: 'R1', metadataId: 'resistor', x: 351, y: 169, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 430, y: 130, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  {
    id: 'w-2-BTN',
    start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-BTN-5V',
    start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-2-RPD',
    start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RPD-GND',
    start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-3-BZ1',
    start: { componentId: 'arduino-mega', pinName: '3', x: 0, y: 0 },
    end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-BZ1-GND',
    start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-4-R1',
    start: { componentId: 'arduino-mega', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'R1', pinName: '1', x: 0, y: 0 },
    color: '#ff8800',
    waypoints: [],
  },
  {
    id: 'w-R1-L1',
    start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#ff8800',
    waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
