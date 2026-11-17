import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

// The sensor drives OUT itself (idle LOW, HIGH for 3 s on trigger), so no
// pull resistor: the worker-side model seeds the pin directly.
export const components = [
  { id: 'PIR1', metadataId: 'pir-motion-sensor', x: 300, y: 120 },
];

export const wires: Wire[] = [
  { id: 'w-14-OUT',   start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
                      end:   { componentId: 'PIR1',     pinName: 'OUT', x: 0, y: 0 },
                      color: '#0000ff', waypoints: [] },
  { id: 'w-5V-VCC',   start: { componentId: 'esp32-s3', pinName: '5V', x: 0, y: 0 },
                      end:   { componentId: 'PIR1',     pinName: 'VCC', x: 0, y: 0 },
                      color: '#ff0000', waypoints: [] },
  { id: 'w-PIR1-GND', start: { componentId: 'PIR1',     pinName: 'GND', x: 0, y: 0 },
                      end:   { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
                      color: '#000000', waypoints: [] },
];
