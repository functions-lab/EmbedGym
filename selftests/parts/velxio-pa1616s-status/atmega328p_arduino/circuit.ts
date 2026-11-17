import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'GPS1', metadataId: 'pa1616s', x: 100, y: 48 },
];

// GPS TX → Uno D8, GPS RX → Uno D7: the sketch uses SoftwareSerial(8, 7). FIX → 2, PPS → 3.
export const wires: Wire[] = [
  {
    id: 'w-8-TX',
    start: { componentId: 'arduino-uno', pinName: '8', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'TX', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-7-RX',
    start: { componentId: 'arduino-uno', pinName: '7', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'RX', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-2-FIX',
    start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'FIX', x: 0, y: 0 },
    color: '#aa00aa',
    waypoints: [],
  },
  {
    id: 'w-3-PPS',
    start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'PPS', x: 0, y: 0 },
    color: '#00aaaa',
    waypoints: [],
  },
  {
    id: 'w-5V-VIN',
    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-GPS1-GND',
    start: { componentId: 'GPS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
