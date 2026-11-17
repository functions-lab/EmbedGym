import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'US1', metadataId: 'hc-sr04', x: 300, y: 60 },
  { id: 'LS1', metadataId: 'level-shifter', x: 220, y: 180 },
];

// TRIG -> GPIO5, ECHO -> LS1 channel 1 -> GPIO6
export const wires: Wire[] = [
  { id: 'w-5-TRIG',  start: { componentId: 'esp32-s3', pinName: '5',     x: 0, y: 0 },
                     end:   { componentId: 'US1',      pinName: 'TRIG',  x: 0, y: 0 },
                     color: '#00aa00', waypoints: [] },
  { id: 'w-6-LV1',   start: { componentId: 'esp32-s3', pinName: '6',     x: 0, y: 0 },
                     end:   { componentId: 'LS1',      pinName: 'LV1',   x: 0, y: 0 },
                     color: '#0000ff', waypoints: [] },
  { id: 'w-HV1-ECHO', start: { componentId: 'LS1',     pinName: 'HV1',   x: 0, y: 0 },
                     end:   { componentId: 'US1',      pinName: 'ECHO',  x: 0, y: 0 },
                     color: '#0000ff', waypoints: [] },
  { id: 'w-5V-HV',   start: { componentId: 'esp32-s3', pinName: '5V',    x: 0, y: 0 },
                     end:   { componentId: 'LS1',      pinName: 'HV',    x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-3V3-LV',  start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
                     end:   { componentId: 'LS1',      pinName: 'LV',    x: 0, y: 0 },
                     color: '#ff8800', waypoints: [] },
  { id: 'w-LS1-GND', start: { componentId: 'LS1',      pinName: 'GND.1', x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
  { id: 'w-5V-VCC',  start: { componentId: 'esp32-s3', pinName: '5V',    x: 0, y: 0 },
                     end:   { componentId: 'US1',      pinName: 'VCC',   x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-US1-GND', start: { componentId: 'US1',      pinName: 'GND',   x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
];
