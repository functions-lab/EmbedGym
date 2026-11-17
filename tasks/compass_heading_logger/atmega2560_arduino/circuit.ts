import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'RTC1', metadataId: 'ds1307', x: 100, y: 96 },
  { id: 'MAG1', metadataId: 'hmc5883l', x: 330, y: 110 },
];

export const wires: Wire[] = [
  {
    id: 'w-20-RTC1-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'RTC1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-21-RTC1-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'RTC1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-5V-RTC1',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'RTC1', pinName: '5V', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-RTC1-GND',
    start: { componentId: 'RTC1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-20-MAG1-SDA',
    start: { componentId: 'arduino-mega', pinName: '20', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'SDA', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-21-MAG1-SCL',
    start: { componentId: 'arduino-mega', pinName: '21', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'SCL', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-3V3-MAG1',
    start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 },
    end: { componentId: 'MAG1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-MAG1-GND',
    start: { componentId: 'MAG1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
];
