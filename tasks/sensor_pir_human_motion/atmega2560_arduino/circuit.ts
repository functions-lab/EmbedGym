import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'PIR', metadataId: 'pir-motion-sensor', x: 100, y: 88 },
];

export const wires: Wire[] = [
  { id: 'w-PIR-VCC', start: { componentId: 'PIR',          pinName: 'VCC', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: '5V',  x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-PIR-OUT', start: { componentId: 'PIR',          pinName: 'OUT', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: '4',   x: 0, y: 0 },
                     color: '#0000ff', waypoints: [] },
  { id: 'w-PIR-GND', start: { componentId: 'PIR',          pinName: 'GND', x: 0, y: 0 },
                     end:   { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
];
