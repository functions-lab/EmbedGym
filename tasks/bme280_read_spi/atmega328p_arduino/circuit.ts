import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'ENV1', metadataId: 'bme280', x: 320, y: 120 },
];

export const wires: Wire[] = [
  {
    id: 'w-13-SCK',
    start: { componentId: 'arduino-uno', pinName: '13', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'SCK', x: 0, y: 0 },
    color: '#ffaa00',
    waypoints: [],
  },
  {
    id: 'w-12-MISO',
    start: { componentId: 'arduino-uno', pinName: '12', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'MISO', x: 0, y: 0 },
    color: '#00aa00',
    waypoints: [],
  },
  {
    id: 'w-11-MOSI',
    start: { componentId: 'arduino-uno', pinName: '11', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'MOSI', x: 0, y: 0 },
    color: '#0066ff',
    waypoints: [],
  },
  {
    id: 'w-10-CS',
    start: { componentId: 'arduino-uno', pinName: '10', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'CS', x: 0, y: 0 },
    color: '#aa00aa',
    waypoints: [],
  },
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'ENV1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000',
    waypoints: [],
  },
  {
    id: 'w-ENV1-GND',
    start: { componentId: 'ENV1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000',
    waypoints: [],
  },
];
