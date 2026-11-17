import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 760, y: 80, properties: { enaJumper: false, enbJumper: false, regulatorJumper: true, sampleWindowMs: 100 } },
  { id: 'BATTERY', metadataId: 'battery-9v', x: 760, y: 320 },
];

export const wires: Wire[] = [
  { id: 'w-IN1', start: { componentId: 'nrf52840-dk', pinName: 'P1.03', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-IN2', start: { componentId: 'nrf52840-dk', pinName: 'P1.04', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-ENA', start: { componentId: 'nrf52840-dk', pinName: 'P1.05', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w-IN3', start: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-IN4', start: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-ENB', start: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-motor-supply', start: { componentId: 'BATTERY', pinName: '+', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-battery-ground', start: { componentId: 'BATTERY', pinName: '−', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-module-ground', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
