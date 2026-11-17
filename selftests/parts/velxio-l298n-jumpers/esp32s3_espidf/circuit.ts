import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 600, y: 80, properties: { enaJumper: true, enbJumper: true, regulatorJumper: true, sampleWindowMs: 100 } },
  { id: 'PULLA', metadataId: 'resistor', x: 810, y: 120, properties: { value: '10k' } },
  { id: 'PULLB', metadataId: 'resistor', x: 810, y: 200, properties: { value: '10k' } },
  { id: 'BATTERY', metadataId: 'battery-9v', x: 600, y: 320 },
];

export const wires: Wire[] = [
  { id: 'pull-PULLA-0', start: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, end: { componentId: 'PULLA', pinName: '1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'pull-PULLA-1', start: { componentId: 'PULLA', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'pull-PULLB-0', start: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, end: { componentId: 'PULLB', pinName: '1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'pull-PULLB-1', start: { componentId: 'PULLB', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'w0', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w1', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'esp32-s3', pinName: '7', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'esp32-s3', pinName: '15', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'BATTERY', pinName: '+', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'BATTERY', pinName: '−', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
];
