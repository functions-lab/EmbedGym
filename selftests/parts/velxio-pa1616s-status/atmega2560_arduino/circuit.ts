import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'GPS1', metadataId: 'pa1616s', x: 100, y: 48 },
];

// GPS TX → Mega RX1 (19), GPS RX → Mega TX1 (18): the module lives on Serial1. FIX → 2, PPS → 3.
export const wires: Wire[] = [
  {
    id: 'w-19-TX',
    start: { componentId: 'arduino-mega', pinName: '19', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'TX', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-18-RX',
    start: { componentId: 'arduino-mega', pinName: '18', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'RX', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-2-FIX',
    start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'FIX', x: 0, y: 0 },
    color: '#aa00aa',
    waypoints: [],
  },
  {
    id: 'w-3-PPS',
    start: { componentId: 'arduino-mega', pinName: '3', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'PPS', x: 0, y: 0 },
    color: '#00aaaa',
    waypoints: [],
  },
  {
    id: 'w-5V-VIN',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'GPS1', pinName: 'VIN', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-GPS1-GND',
    start: { componentId: 'GPS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
