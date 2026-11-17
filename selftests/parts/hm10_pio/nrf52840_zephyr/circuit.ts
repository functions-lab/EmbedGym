import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 1000, y: 120, properties: {'savedMode': 1, 'startupConfiguration': '{"collectionSeconds":1}'} },
  { id: 'PULL0', metadataId: 'resistor', x: 760, y: 90, properties: {'value': '1000'} },
  { id: 'PULL1', metadataId: 'resistor', x: 870, y: 90, properties: {'value': '10000'} },
  { id: 'PULL2', metadataId: 'resistor', x: 760, y: 190, properties: {'value': '10000'} },
  { id: 'PULL3', metadataId: 'resistor', x: 870, y: 190, properties: {'value': '10000'} },
  { id: 'PULL4', metadataId: 'resistor', x: 760, y: 290, properties: {'value': '10000'} },
  { id: 'PULL5', metadataId: 'resistor', x: 870, y: 290, properties: {'value': '10000'} },
  { id: 'PULL6', metadataId: 'resistor', x: 760, y: 390, properties: {'value': '10000'} },
  { id: 'PULL7', metadataId: 'resistor', x: 870, y: 390, properties: {'value': '10000'} },
];

// PIO1 -> P1.04, PIO2 -> P1.05; PIO4 <- P1.06 through 1 kΩ; PIO5..11 pulled to
// VDD (6, 9, 11) or GND (5, 7, 8, 10) through 10 kΩ.
export const wires: Wire[] = [
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'RADIO', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO1-P1.04', start: { componentId: 'RADIO', pinName: 'PIO1', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.04', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PIO2-P1.05', start: { componentId: 'RADIO', pinName: 'PIO2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.05', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PIO4-PULL0', start: { componentId: 'RADIO', pinName: 'PIO4', x: 0, y: 0 }, end: { componentId: 'PULL0', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL0-P1.06', start: { componentId: 'PULL0', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'P1.06', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PIO5-PULL1', start: { componentId: 'RADIO', pinName: 'PIO5', x: 0, y: 0 }, end: { componentId: 'PULL1', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL1-GND', start: { componentId: 'PULL1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO6-PULL2', start: { componentId: 'RADIO', pinName: 'PIO6', x: 0, y: 0 }, end: { componentId: 'PULL2', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL2-VDD', start: { componentId: 'PULL2', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIO7-PULL3', start: { componentId: 'RADIO', pinName: 'PIO7', x: 0, y: 0 }, end: { componentId: 'PULL3', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL3-GND', start: { componentId: 'PULL3', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO8-PULL4', start: { componentId: 'RADIO', pinName: 'PIO8', x: 0, y: 0 }, end: { componentId: 'PULL4', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL4-GND', start: { componentId: 'PULL4', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO9-PULL5', start: { componentId: 'RADIO', pinName: 'PIO9', x: 0, y: 0 }, end: { componentId: 'PULL5', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL5-VDD', start: { componentId: 'PULL5', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIO10-PULL6', start: { componentId: 'RADIO', pinName: 'PIO10', x: 0, y: 0 }, end: { componentId: 'PULL6', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL6-GND', start: { componentId: 'PULL6', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO11-PULL7', start: { componentId: 'RADIO', pinName: 'PIO11', x: 0, y: 0 }, end: { componentId: 'PULL7', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL7-VDD', start: { componentId: 'PULL7', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
];
