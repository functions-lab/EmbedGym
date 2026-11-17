import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 180 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 550, y: 80, properties: { enaJumper: false, enbJumper: false, regulatorJumper: true, sampleWindowMs: 1000 } },
  { id: 'BATTERY', metadataId: 'battery-9v', x: 550, y: 300 },
  { id: 'BUTTON', metadataId: 'pushbutton', x: 100, y: 80 },
  { id: 'PULLDOWN', metadataId: 'resistor-10k', x: 190, y: 110 },
];

export const wires: Wire[] = [
  { id: 'w-IN1', start: { componentId: 'arduino-mega', pinName: '5', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-IN2', start: { componentId: 'arduino-mega', pinName: '6', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-ENA', start: { componentId: 'arduino-mega', pinName: '7', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w-IN3', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-IN4', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-ENB', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-motor-supply', start: { componentId: 'BATTERY', pinName: '+', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-battery-ground', start: { componentId: 'BATTERY', pinName: '−', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-module-ground', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-button-signal', start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'BUTTON', pinName: '1.l', x: 0, y: 0 }, color: '#7755cc', waypoints: [] },
  { id: 'w-button-power', start: { componentId: 'BUTTON', pinName: '2.l', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-pulldown-signal', start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'PULLDOWN', pinName: '1', x: 0, y: 0 }, color: '#7755cc', waypoints: [] },
  { id: 'w-pulldown-ground', start: { componentId: 'PULLDOWN', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
