import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

export const components = [
  { id: 'BLE1', metadataId: 'hm10', x: 700, y: 90 },
  { id: 'SHIFT', metadataId: 'level-shifter', x: 460, y: 70 },
];

// HM-10 TXD → Mega RX1 (19); Mega TX1 (18) → HM-10 RXD through level-shifter channel 1 (HV 5V, LV 3.3V).
export const wires: Wire[] = [
  {
    id: 'w-5V-VCC',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'BLE1', pinName: 'VCC', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-GND-GND',
    start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'BLE1', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
  {
    id: 'w-TXD-19',
    start: { componentId: 'BLE1', pinName: 'TXD', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: '19', x: 0, y: 0 },
    color: '#00aa00', waypoints: [],
  },
  {
    id: 'w-18-HV1',
    start: { componentId: 'arduino-mega', pinName: '18', x: 0, y: 0 },
    end: { componentId: 'SHIFT', pinName: 'HV1', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-LV1-RXD',
    start: { componentId: 'SHIFT', pinName: 'LV1', x: 0, y: 0 },
    end: { componentId: 'BLE1', pinName: 'RXD', x: 0, y: 0 },
    color: '#ffaa00', waypoints: [],
  },
  {
    id: 'w-5V-HV',
    start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'SHIFT', pinName: 'HV', x: 0, y: 0 },
    color: '#ff0000', waypoints: [],
  },
  {
    id: 'w-3V3-LV',
    start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 },
    end: { componentId: 'SHIFT', pinName: 'LV', x: 0, y: 0 },
    color: '#ff8800', waypoints: [],
  },
  {
    id: 'w-SHIFT-GND',
    start: { componentId: 'SHIFT', pinName: 'GND.1', x: 0, y: 0 },
    end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 },
    color: '#000000', waypoints: [],
  },
];
