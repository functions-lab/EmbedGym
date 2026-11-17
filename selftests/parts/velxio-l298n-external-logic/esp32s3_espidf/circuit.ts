import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'DRIVER', metadataId: 'l298n', x: 600, y: 80, properties: { enaJumper: false, enbJumper: false, regulatorJumper: false, sampleWindowMs: 100 } },
  { id: 'BATTERY', metadataId: 'power-supply', x: 600, y: 320, properties: { mode: 'dc', voltage: 5, currentLimit: 1 } },
];

export const wires: Wire[] = [
  { id: 'logic', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+5V', x: 0, y: 0 }, color: '#cc4444', waypoints: [] },
  { id: 'w0', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w1', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w2', start: { componentId: 'esp32-s3', pinName: '6', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENA', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'esp32-s3', pinName: '7', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'esp32-s3', pinName: '15', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'IN4', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'esp32-s3', pinName: '16', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: 'ENB', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'BATTERY', pinName: 'SIG', x: 0, y: 0 }, end: { componentId: 'DRIVER', pinName: '+12V', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'BATTERY', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'DRIVER', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
];
