import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';
export const boards: BoardInstance[] = [{ id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance];
export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 700, y: 90 },
  { id: 'UPPER', metadataId: 'resistor', x: 460, y: 70, properties: {'value': '1000'} },
  { id: 'LOWER', metadataId: 'resistor', x: 560, y: 100, properties: {'value': '2000'} },
];
export const wires: Wire[] = [
  { id: 'wire-0', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-1', start: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-2', start: { componentId: 'arduino-uno', pinName: '7', x: 0, y: 0 }, end: { componentId: 'UPPER', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-3', start: { componentId: 'UPPER', pinName: '2', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'RXD', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-4', start: { componentId: 'RADIO', pinName: 'RXD', x: 0, y: 0 }, end: { componentId: 'LOWER', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-5', start: { componentId: 'LOWER', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-6', start: { componentId: 'RADIO', pinName: 'TXD', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: '8', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
];
