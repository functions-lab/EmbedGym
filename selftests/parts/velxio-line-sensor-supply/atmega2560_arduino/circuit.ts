import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 100 } as BoardInstance];

export const components = [
  { id: 'SENSOR', metadataId: 'line-sensor', x: 550, y: 80 },
  { id: 'SUPPLY_R', metadataId: 'resistor', x: 550, y: 270, properties: { value: '1' } },
];

export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'SUPPLY_R', pinName: '1', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'SUPPLY_R', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w2', start: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w3', start: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'A1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'SENSOR', pinName: 'R', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'A2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
];
