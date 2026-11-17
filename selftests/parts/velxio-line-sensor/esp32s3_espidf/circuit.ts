import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';

export const boards: BoardInstance[] = [{ id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance];

export const components = [
  { id: 'SENSOR', metadataId: 'line-sensor', x: 320, y: 60 },
  { id: 'LS1', metadataId: 'level-shifter', x: 220, y: 260 },
];

// The 5 V sensor's L/M/R reach GPIO12..14 through LS1 channels 1..3.
export const wires: Wire[] = [
  { id: 'w0', start: { componentId: 'SENSOR', pinName: 'VCC', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w1', start: { componentId: 'SENSOR', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
  { id: 'w2', start: { componentId: 'SENSOR', pinName: 'L', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w3', start: { componentId: 'SENSOR', pinName: 'M', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV2', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w4', start: { componentId: 'SENSOR', pinName: 'R', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV3', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w5', start: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '12', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w6', start: { componentId: 'LS1', pinName: 'LV2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '13', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w7', start: { componentId: 'LS1', pinName: 'LV3', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 }, color: '#4499cc', waypoints: [] },
  { id: 'w8', start: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, color: '#dd3333', waypoints: [] },
  { id: 'w9', start: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w10', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#333333', waypoints: [] },
];
