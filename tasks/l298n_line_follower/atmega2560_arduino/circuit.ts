import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 100 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 550, y: 80, properties: { enaJumper: false, enbJumper: false, regulatorJumper: true, sampleWindowMs: 1000 } },
  { id: 'BATTERY', metadataId: 'battery-9v', x: 550, y: 310 },
  { id: 'SENSOR', metadataId: 'line-sensor', x: 780, y: 80, properties: { thresholdPosition: 0.5, leftPhotocurrentUa: 300, middlePhotocurrentUa: 200, rightPhotocurrentUa: 300 } },
];

export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'arduino-mega', pinName: '5', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w1', start: { componentId: 'arduino-mega', pinName: '6', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w2', start: { componentId: 'arduino-mega', pinName: '7', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'arduino-mega', pinName: '8', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'arduino-mega', pinName: '9', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'arduino-mega', pinName: '10', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'BATTERY', pinName: '+', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w7', start: { componentId: 'BATTERY', pinName: '−', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w8', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w9', start: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w10', start: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w11', start: { componentId: 'arduino-mega', pinName: '24', x: 0, y: 0 }, end: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w12', start: { componentId: 'arduino-mega', pinName: '25', x: 0, y: 0 }, end: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w13', start: { componentId: 'arduino-mega', pinName: '26', x: 0, y: 0 }, end: { componentId: 'SENSOR', pinName: 'R', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
];
