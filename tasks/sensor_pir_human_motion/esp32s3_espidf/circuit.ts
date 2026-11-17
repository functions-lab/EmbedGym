import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'PIR', metadataId: 'pir-motion-sensor', x: 300, y: 120 },
];

// HC-SR501 signal -> GPIO14
export const wires: Wire[] = [
  { id: 'w-PIR-VCC', start: { componentId: 'PIR',      pinName: 'VCC', x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: '5V',  x: 0, y: 0 },
                     color: '#ff0000', waypoints: [] },
  { id: 'w-PIR-OUT', start: { componentId: 'PIR',      pinName: 'OUT', x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: '14',  x: 0, y: 0 },
                     color: '#0000ff', waypoints: [] },
  { id: 'w-PIR-GND', start: { componentId: 'PIR',      pinName: 'GND', x: 0, y: 0 },
                     end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                     color: '#000000', waypoints: [] },
];
