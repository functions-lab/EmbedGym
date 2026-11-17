import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'MAG1', metadataId: 'hmc5883l', x: 330, y: 110 },
];

export const wires: Wire[] = [
  {
    id: 'w-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-VCC',
    start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GND',
    start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-DRDY',
    start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'DRDY', x: 0, y: 0 },
    color: '#4488ff', waypoints: [],
  },
];
