import type { BoardInstance } from '@velxio/types/board';
import type { Wire } from '@velxio/types/wire';
export const boards: BoardInstance[] = [{ id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance];
export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 850, y: 100, properties: {'savedMode': 1, 'startupConfiguration': '{"collectionSeconds":1}'} },
  { id: 'SHIFT', metadataId: 'level-shifter', x: 600, y: 70 },
  { id: 'PULL1', metadataId: 'resistor', x: 710, y: 70, properties: {'value': '10000'} },
  { id: 'PULL2', metadataId: 'resistor', x: 600, y: 170, properties: {'value': '10000'} },
  { id: 'PULL3', metadataId: 'resistor', x: 710, y: 170, properties: {'value': '10000'} },
  { id: 'PULL4', metadataId: 'resistor', x: 600, y: 270, properties: {'value': '10000'} },
  { id: 'PULL5', metadataId: 'resistor', x: 710, y: 270, properties: {'value': '10000'} },
  { id: 'PULL6', metadataId: 'resistor', x: 600, y: 370, properties: {'value': '10000'} },
  { id: 'PULL7', metadataId: 'resistor', x: 710, y: 370, properties: {'value': '10000'} },
];
export const wires: Wire[] = [
  { id: 'wire-0', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-1', start: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-2', start: { componentId: 'RADIO', pinName: 'PIO1', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-3', start: { componentId: 'RADIO', pinName: 'PIO4', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'LV1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-4', start: { componentId: 'SHIFT', pinName: 'HV1', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-21', start: { componentId: 'RADIO', pinName: 'PIO2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '3', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-5', start: { componentId: 'RADIO', pinName: 'PIO5', x: 0, y: 0 }, end: { componentId: 'PULL1', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-6', start: { componentId: 'PULL1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-7', start: { componentId: 'RADIO', pinName: 'PIO6', x: 0, y: 0 }, end: { componentId: 'PULL2', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-8', start: { componentId: 'PULL2', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-9', start: { componentId: 'RADIO', pinName: 'PIO7', x: 0, y: 0 }, end: { componentId: 'PULL3', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-10', start: { componentId: 'PULL3', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-11', start: { componentId: 'RADIO', pinName: 'PIO8', x: 0, y: 0 }, end: { componentId: 'PULL4', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-12', start: { componentId: 'PULL4', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-13', start: { componentId: 'RADIO', pinName: 'PIO9', x: 0, y: 0 }, end: { componentId: 'PULL5', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-14', start: { componentId: 'PULL5', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-15', start: { componentId: 'RADIO', pinName: 'PIO10', x: 0, y: 0 }, end: { componentId: 'PULL6', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-16', start: { componentId: 'PULL6', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-17', start: { componentId: 'RADIO', pinName: 'PIO11', x: 0, y: 0 }, end: { componentId: 'PULL7', pinName: '1', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'wire-18', start: { componentId: 'PULL7', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, color: '#2288aa', waypoints: [] },
  { id: 'w-5V-HV', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'HV', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-3V3-LV', start: { componentId: 'arduino-mega', pinName: '3.3V', x: 0, y: 0 }, end: { componentId: 'SHIFT', pinName: 'LV', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-SHIFT-GND', start: { componentId: 'SHIFT', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
