import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';
export const boards: BoardInstance[] = [{ id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance];
export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 700, y: 90, properties: {'startupConfiguration': '{"flow":1}'} },
  { id: 'SHIFT', metadataId: 'level-shifter', x: 460, y: 70 },
];
export const wires: Wire[] = [
  { id: 'wire-0', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-1', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-2', start: { componentId: 'arduino-mega', pinName: '18', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'HV1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-3', start: { componentId: 'SHIFT', pinName: 'LV1', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'RXD', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-6', start: { componentId: 'RADIO', pinName: 'TXD', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '19', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-7', start: { componentId: 'arduino-mega', pinName: '22', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'HV2', x: 0, y: 0 }, color: '#aa8822', waypoints: [] },
  { id: 'wire-8', start: { componentId: 'SHIFT', pinName: 'LV2', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'UART_CTS', x: 0, y: 0 }, color: '#aa8822', waypoints: [] },
  { id: 'wire-11', start: { componentId: 'RADIO', pinName: 'UART_RTS', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '23', x: 0, y: 0 }, color: '#aa8822', waypoints: [] },
  { id: 'w-5V-HV', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'HV', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-3V3-LV', start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'LV', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-SHIFT-GND', start: { componentId: 'SHIFT', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
