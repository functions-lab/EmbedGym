import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'MIC1', metadataId: 'ky-038-sound-sensor', x: 100, y: 120 },
  { id: 'RLY1', metadataId: 'relay-module', x: 192, y: 108 },
];

export const wires: Wire[] = [
  {
    id: 'w-7-DOUT',
    start: { componentId: 'arduino-uno', pinName: '7', x: 0, y: 0 },
    end:   { componentId: 'MIC1',        pinName: 'D0', x: 0, y: 0 },
    color: '#0000ff',
    waypoints: [],
  },
  {
    id: 'w-5V-MIC-VCC',
    start: { componentId: 'arduino-uno', pinName: '5V',  x: 0, y: 0 },
    end:   { componentId: 'MIC1',        pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-MIC-GND',
    start: { componentId: 'MIC1',        pinName: 'GND', x: 0, y: 0 },
    end:   { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
  {
    id: 'w-2-IN',
    start: { componentId: 'arduino-uno', pinName: '2',  x: 0, y: 0 },
    end:   { componentId: 'RLY1',        pinName: 'IN', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-5V-RLY-VCC',
    start: { componentId: 'arduino-uno', pinName: '5V',  x: 0, y: 0 },
    end:   { componentId: 'RLY1',        pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-RLY-GND',
    start: { componentId: 'RLY1',        pinName: 'GND', x: 0, y: 0 },
    end:   { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
