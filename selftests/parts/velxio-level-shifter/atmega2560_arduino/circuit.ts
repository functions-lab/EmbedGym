import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'LS1', metadataId: 'level-shifter', x: 320, y: 120 },
  { id: 'ENV1', metadataId: 'bme280', x: 460, y: 120 },
];

// The Mega's 5 V I2C on HV1 (SDA 20) and HV2 (SCL 21); the 3.3 V BME280 on LV1 / LV2.
export const wires: Wire[] = [
  { id: 'w-20-HV1', start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-LV1-SDA', start: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'SDA', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-21-HV2', start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV2', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-LV2-SCL', start: { componentId: 'LS1', pinName: 'LV2', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'SCL', x: 0, y: 0 }, color: '#ffaa00', waypoints: [] },
  { id: 'w-5V-HV', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-3V3-LV', start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, end: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-LS1-GND', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-3V3-VCC', start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, end: { componentId: 'ENV1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-ENV1-GND', start: { componentId: 'ENV1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
