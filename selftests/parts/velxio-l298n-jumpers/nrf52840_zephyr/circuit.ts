import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 760, y: 80, properties: { enaJumper: true, enbJumper: true, regulatorJumper: true, sampleWindowMs: 100 } },
  { id: 'PULLA', metadataId: 'resistor', x: 970, y: 120, properties: { value: '10k' } },
  { id: 'PULLB', metadataId: 'resistor', x: 970, y: 200, properties: { value: '10k' } },
  { id: 'BATTERY', metadataId: 'battery-9v', x: 760, y: 320 },
];

export const wires: Wire[] = [
  { id: 'pull-PULLA-0', start: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, end: { componentId: 'PULLA', pinName: '1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'pull-PULLA-1', start: { componentId: 'PULLA', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'pull-PULLB-0', start: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, end: { componentId: 'PULLB', pinName: '1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'pull-PULLB-1', start: { componentId: 'PULLB', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'w0', start: { componentId: 'nrf52840-dk', pinName: 'P1.03', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w1', start: { componentId: 'nrf52840-dk', pinName: 'P1.04', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'nrf52840-dk', pinName: 'P1.06', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'nrf52840-dk', pinName: 'P1.07', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'BATTERY', pinName: '+', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'BATTERY', pinName: '−', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
];
