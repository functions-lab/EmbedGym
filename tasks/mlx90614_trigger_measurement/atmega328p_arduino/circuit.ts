import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'IR1', metadataId: 'mlx90614', x: 420, y: 80 },
  { id: 'BTN', metadataId: 'pushbutton', x: 100, y: 80 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 190, y: 110 },
];

export const wires: Wire[] = [
  { id: 'w-SDA', start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-SCL', start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-VIN', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'IR1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-10-BTN', start: { componentId: 'arduino-uno', pinName: '10', x: 0, y: 0 }, end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-BTN-5V', start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-10-RPD', start: { componentId: 'arduino-uno', pinName: '10', x: 0, y: 0 }, end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-RPD-GND', start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
