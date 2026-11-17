import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'TILT1', metadataId: 'ky-020-tilt-switch', x: 300, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 420, y: 120 },
];

// tilt S -> GPIO14, buzzer signal -> GPIO13
export const wires: Wire[] = [
  { id: 'w-14-S',    start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
                     end:   { componentId: 'TILT1',    pinName: 'S', x: 0, y: 0 },
                     color: '#0000ff', waypoints: [] },
  { id: 'w-3V3-V',   start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
                     end:   { componentId: 'TILT1',    pinName: 'V', x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-TILT1-G', start: { componentId: 'TILT1',    pinName: 'G', x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
  { id: 'w-13-BZ',   start: { componentId: 'esp32-s3', pinName: '13', x: 0, y: 0 },
                     end:   { componentId: 'BZ1',      pinName: '1', x: 0, y: 0 },
                     color: '#ffaa00', waypoints: [] },
  { id: 'w-BZ-GND',  start: { componentId: 'BZ1',      pinName: '2', x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
];
