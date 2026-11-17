import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

// D0 is driven by the module itself (HIGH while soundLevel > threshold), so no
// pull resistor: the part seeds the pin directly through the bridge. A0 rides
// the ADC path (GPIO4 = ADC1 CH3).
export const components = [
  { id: 'MIC1', metadataId: 'ky-038-sound-sensor', x: 300, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-14-D0',
    start: { componentId: 'esp32-s3', pinName: '14', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'D0', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-4-A0',
    start: { componentId: 'esp32-s3', pinName: '4', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'A0', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-3V3-VCC',
    start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 },
    end: { componentId: 'MIC1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-MIC1-GND',
    start: { componentId: 'MIC1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
