import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

// The sensor drives signal itself (idle LOW, one 50 ms HIGH pulse per shock),
// so no pull resistor: the worker-side model seeds the pin directly.
export const components = [
  { id: 'SH1', metadataId: 'shock-sensor', x: 300, y: 120 },
];

export const wires: Wire[] = [
  { id: 'w-14-signal', start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
                       end:   { componentId: 'SH1',      pinName: 'signal', x: 0, y: 0 },
                       color: '#0000ff', waypoints: [] },
  { id: 'w-3V3-VCC',   start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
                       end:   { componentId: 'SH1',      pinName: 'VCC', x: 0, y: 0 },
                       color: '#ff0000', waypoints: [] },
  { id: 'w-SH1-GND',   start: { componentId: 'SH1',      pinName: 'GND', x: 0, y: 0 },
                       end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                       color: '#000000', waypoints: [] },
];
