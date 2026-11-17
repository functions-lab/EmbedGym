import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 100 } as BoardInstance];

export const components = [
  { id: 'SENSOR', metadataId: 'line-sensor', x: 550, y: 80 },
  { id: 'GROUND_LOAD', metadataId: 'resistor', x: 550, y: 270, properties: { value: '10k' } },
  { id: 'PULL_LOAD', metadataId: 'resistor', x: 680, y: 270, properties: { value: '30k' } }
];

export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'A1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'SENSOR', pinName: 'R', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'A2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, end: { componentId: 'GROUND_LOAD', pinName: '1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'GROUND_LOAD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, end: { componentId: 'PULL_LOAD', pinName: '1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'PULL_LOAD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, color: '#4499cc', waypoints: [] }
];
