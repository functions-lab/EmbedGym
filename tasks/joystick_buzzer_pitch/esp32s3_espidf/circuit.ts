import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'JOY1', metadataId: 'joystick', x: 300, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 440, y: 120 },
];

export const wires: Wire[] = [
  { id: 'w-9-VRy',    start: { componentId: 'esp32-s3', pinName: '9', x: 0, y: 0 },
                      end:   { componentId: 'JOY1',     pinName: 'VRy', x: 0, y: 0 },
                      color: '#0000ff', waypoints: [] },
  { id: 'w-3V3-JOY',  start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
                      end:   { componentId: 'JOY1',     pinName: 'VCC', x: 0, y: 0 },
                      color: '#ff0000', waypoints: [] },
  { id: 'w-JOY-GND',  start: { componentId: 'JOY1',     pinName: 'GND', x: 0, y: 0 },
                      end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                      color: '#000000', waypoints: [] },
  { id: 'w-11-BZ1',   start: { componentId: 'esp32-s3', pinName: '11', x: 0, y: 0 },
                      end:   { componentId: 'BZ1',      pinName: '1', x: 0, y: 0 },
                      color: '#00aa00', waypoints: [] },
  { id: 'w-BZ1-GND',  start: { componentId: 'BZ1',      pinName: '2', x: 0, y: 0 },
                      end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                      color: '#000000', waypoints: [] },
];
