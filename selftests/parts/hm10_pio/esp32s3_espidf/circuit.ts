import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'esp32-s3', boardKind: 'esp32-s3', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'RADIO', metadataId: 'hm10', x: 700, y: 100, properties: {'savedMode': 1, 'startupConfiguration': '{"collectionSeconds":1}'} },
  { id: 'PULL0', metadataId: 'resistor', x: 450, y: 70, properties: {'value': '1000'} },
  { id: 'PULL1', metadataId: 'resistor', x: 560, y: 70, properties: {'value': '10000'} },
  { id: 'PULL2', metadataId: 'resistor', x: 450, y: 170, properties: {'value': '10000'} },
  { id: 'PULL3', metadataId: 'resistor', x: 560, y: 170, properties: {'value': '10000'} },
  { id: 'PULL4', metadataId: 'resistor', x: 450, y: 270, properties: {'value': '10000'} },
  { id: 'PULL5', metadataId: 'resistor', x: 560, y: 270, properties: {'value': '10000'} },
  { id: 'PULL6', metadataId: 'resistor', x: 450, y: 370, properties: {'value': '10000'} },
  { id: 'PULL7', metadataId: 'resistor', x: 560, y: 370, properties: {'value': '10000'} },
];

// PIO1 -> GPIO6, PIO2 -> GPIO7; PIO4 <- GPIO15 through 1 kΩ; PIO5..11 pulled to
// 3V3 (6, 9, 11) or GND (5, 7, 8, 10) through 10 kΩ.
export const wires: Wire[] = [
  { id: 'w-3V3-VCC', start: { componentId: 'esp32-s3', pinName: '3V3.1', x: 0, y: 0 }, end: { componentId: 'RADIO', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-GND', start: { componentId: 'RADIO', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO1-6', start: { componentId: 'RADIO', pinName: 'PIO1', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '6', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PIO2-7', start: { componentId: 'RADIO', pinName: 'PIO2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '7', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PIO4-PULL0', start: { componentId: 'RADIO', pinName: 'PIO4', x: 0, y: 0 }, end: { componentId: 'PULL0', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL0-15', start: { componentId: 'PULL0', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '15', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PIO5-PULL1', start: { componentId: 'RADIO', pinName: 'PIO5', x: 0, y: 0 }, end: { componentId: 'PULL1', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL1-GND', start: { componentId: 'PULL1', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO6-PULL2', start: { componentId: 'RADIO', pinName: 'PIO6', x: 0, y: 0 }, end: { componentId: 'PULL2', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL2-3V3', start: { componentId: 'PULL2', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '3V3.2', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIO7-PULL3', start: { componentId: 'RADIO', pinName: 'PIO7', x: 0, y: 0 }, end: { componentId: 'PULL3', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL3-GND', start: { componentId: 'PULL3', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO8-PULL4', start: { componentId: 'RADIO', pinName: 'PIO8', x: 0, y: 0 }, end: { componentId: 'PULL4', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL4-GND', start: { componentId: 'PULL4', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO9-PULL5', start: { componentId: 'RADIO', pinName: 'PIO9', x: 0, y: 0 }, end: { componentId: 'PULL5', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL5-3V3', start: { componentId: 'PULL5', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '3V3.2', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-PIO10-PULL6', start: { componentId: 'RADIO', pinName: 'PIO10', x: 0, y: 0 }, end: { componentId: 'PULL6', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL6-GND', start: { componentId: 'PULL6', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-PIO11-PULL7', start: { componentId: 'RADIO', pinName: 'PIO11', x: 0, y: 0 }, end: { componentId: 'PULL7', pinName: '1', x: 0, y: 0 }, color: '#4488ff', waypoints: [] },
  { id: 'w-PULL7-3V3', start: { componentId: 'PULL7', pinName: '2', x: 0, y: 0 }, end: { componentId: 'esp32-s3', pinName: '3V3.2', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
];
