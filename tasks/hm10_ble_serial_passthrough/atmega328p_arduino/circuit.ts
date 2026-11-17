import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'BLE1', metadataId: 'hm10', x: 700, y: 90 },
  { id: 'R_UPPER', metadataId: 'resistor', x: 460, y: 70, properties: { value: '1000' } },
  { id: 'R_LOWER', metadataId: 'resistor', x: 560, y: 100, properties: { value: '2000' } },
];

// HM-10 TXD → Uno D8; Uno D7 → HM-10 RXD through a 1 kΩ / 2 kΩ divider.
export const wires: Wire[] = [
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'BLE1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GND-GND',
    start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'BLE1', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-TXD-8',
    start: { componentId: 'BLE1', pinName: 'TXD', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: '8', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-7-upper',
    start: { componentId: 'arduino-uno', pinName: '7', x: 0, y: 0 },
    end: { componentId: 'R_UPPER', pinName: '1', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-upper-RXD',
    start: { componentId: 'R_UPPER', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'BLE1', pinName: 'RXD', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-RXD-lower',
    start: { componentId: 'BLE1', pinName: 'RXD', x: 0, y: 0 },
    end: { componentId: 'R_LOWER', pinName: '1', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-lower-GND',
    start: { componentId: 'R_LOWER', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
];
