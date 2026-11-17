import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

// The module drives SW itself (idle HIGH, LOW while pressed), so no external
// pull resistor: the part seeds the pin directly through the bridge.
export const components = [
  { id: 'JOY1', metadataId: 'joystick', x: 300, y: 120 },
];

export const wires: Wire[] = [
  { id: 'w-4-VRx',    start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 },
                      end:   { componentId: 'JOY1',     pinName: 'VRx', x: 0, y: 0 },
                      color: '#0000ff', waypoints: [] },
  { id: 'w-5-VRy',    start: { componentId: 'esp32-s3', pinName: '5', x: 0, y: 0 },
                      end:   { componentId: 'JOY1',     pinName: 'VRy', x: 0, y: 0 },
                      color: '#00aaff', waypoints: [] },
  { id: 'w-14-SW',    start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
                      end:   { componentId: 'JOY1',     pinName: 'SW', x: 0, y: 0 },
                      color: '#ffaa00', waypoints: [] },
  { id: 'w-3V3-VCC',  start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
                      end:   { componentId: 'JOY1',     pinName: 'VCC', x: 0, y: 0 },
                      color: '#ff0000', waypoints: [] },
  { id: 'w-JOY-GND',  start: { componentId: 'JOY1',     pinName: 'GND', x: 0, y: 0 },
                      end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                      color: '#000000', waypoints: [] },
];
