import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TOUCH1', metadataId: 'mpr121', x: 400, y: 80 },
  { id: 'R0', metadataId: 'resistor', x: 560, y: 200, properties: { value: '10k' } },
  { id: 'R1', metadataId: 'resistor', x: 560, y: 260, properties: { value: '100k' } },
  { id: 'R2', metadataId: 'resistor', x: 560, y: 320, properties: { value: '10k' } },
  { id: 'R3', metadataId: 'resistor', x: 560, y: 380, properties: { value: '10k' } },
];

// SDA -> GPIO38, SCL -> GPIO39, INT -> GPIO4. Electrode 4 reaches GPIO5 through
// R0 with R1 to ground; 5..11 -> GPIO6, 7, 15, 16, 17, 18, 21; R2 pulls 6 up to
// 3Vo, R3 pulls 7 down.
export const wires: Wire[] = [
  { id: 'w-38-SDA', start: { componentId: 'esp32-s3', pinName: '38', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-39-SCL', start: { componentId: 'esp32-s3', pinName: '39', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VIN', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'VIN', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-TOUCH1-GND', start: { componentId: 'TOUCH1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-4-INT', start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: 'INT', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E4-R0', start: { componentId: 'TOUCH1', pinName: '4', x: 0, y: 0 }, end: { componentId: 'R0', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R0-5', start: { componentId: 'R0', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E4-R1', start: { componentId: 'TOUCH1', pinName: '4', x: 0, y: 0 }, end: { componentId: 'R1', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R1-GND', start: { componentId: 'R1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E5-6', start: { componentId: 'TOUCH1', pinName: '5', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '6', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E6-7', start: { componentId: 'TOUCH1', pinName: '6', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '7', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E7-15', start: { componentId: 'TOUCH1', pinName: '7', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '15', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E8-16', start: { componentId: 'TOUCH1', pinName: '8', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '16', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E9-17', start: { componentId: 'TOUCH1', pinName: '9', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '17', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E10-18', start: { componentId: 'TOUCH1', pinName: '10', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '18', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E11-21', start: { componentId: 'TOUCH1', pinName: '11', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '21', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E6-R2', start: { componentId: 'TOUCH1', pinName: '6', x: 0, y: 0 }, end: { componentId: 'R2', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R2-3Vo', start: { componentId: 'R2', pinName: '2', x: 0, y: 0 }, end: { componentId: 'TOUCH1', pinName: '3Vo', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-E7-R3', start: { componentId: 'TOUCH1', pinName: '7', x: 0, y: 0 }, end: { componentId: 'R3', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-R3-GND', start: { componentId: 'R3', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
];
