import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'MAG1', metadataId: 'hmc5883l', x: 330, y: 110 },
  { id: 'R1', metadataId: 'resistor', x: 180, y: 140, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 270, y: 110, properties: { color: 'green' } },
];

export const wires: Wire[] = [
  {
    id: 'w-3-R1',
    start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 },
    end: { componentId: 'R1', pinName: '1', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-R1-L1',
    start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-L1-GND',
    start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-SDA',
    start: { componentId: 'arduino-uno', pinName: 'A4', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-SCL',
    start: { componentId: 'arduino-uno', pinName: 'A5', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-VCC',
    start: { componentId: 'arduino-uno', pinName: '3.3V', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GND',
    start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
];
