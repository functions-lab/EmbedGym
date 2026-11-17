import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 760, y: 80, properties: { enaJumper: false, enbJumper: false, regulatorJumper: true, sampleWindowMs: 100 } },
  { id: 'BATTERY', metadataId: 'battery-9v', x: 760, y: 320 },
];

export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'nrf52840-dk', pinName: 'P1.03', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w1', start: { componentId: 'nrf52840-dk', pinName: 'P1.04', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w2', start: { componentId: 'nrf52840-dk', pinName: 'P1.05', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'nrf52840-dk', pinName: 'P1.06', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'nrf52840-dk', pinName: 'P1.07', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'nrf52840-dk', pinName: 'P1.08', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'BATTERY', pinName: '+', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'BATTERY', pinName: '−', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
];
