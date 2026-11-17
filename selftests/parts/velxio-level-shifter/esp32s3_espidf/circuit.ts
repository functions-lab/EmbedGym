import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'LS1', metadataId: 'level-shifter', x: 220, y: 180 },
  { id: 'RLY1', metadataId: 'relay-module', x: 320, y: 260 },
  { id: 'US1', metadataId: 'hc-sr04', x: 320, y: 60 },
];

// GPIO10 -> LS1 LV1, HV1 -> relay IN (LV -> HV); TRIG <- GPIO5 directly,
// ECHO -> LS1 HV2, LV2 -> GPIO6 (HV -> LV).
export const wires: Wire[] = [
  { id: 'w-10-LV1', start: { componentId: 'esp32-s3', pinName: '10', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-HV1-IN', start: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'IN', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5-TRIG', start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 }, end: { componentId: 'US1', pinName: 'TRIG', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-6-LV2', start: { componentId: 'esp32-s3', pinName: '6', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV2', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-HV2-ECHO', start: { componentId: 'LS1', pinName: 'HV2', x: 0, y: 0 }, end: { componentId: 'US1', pinName: 'ECHO', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-5V-HV', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-3V3-LV', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-LS1-GND', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-5V-RLY1', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RLY1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RLY1-GND', start: { componentId: 'RLY1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-5V-US1', start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'US1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-US1-GND', start: { componentId: 'US1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
