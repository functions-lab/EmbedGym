import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'ENC1', metadataId: 'ky-040', x: 720, y: 120 },
];

// CLK -> P1.08, DT -> P1.01, SW -> P1.02
export const wires: Wire[] = [
  { id: 'w-P1.08-CLK', start: { componentId: 'nrf52840-dk', pinName: 'P1.08', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'CLK', x: 0, y: 0 }, color: '#f59e0b', waypoints: [] },
  { id: 'w-P1.01-DT', start: { componentId: 'nrf52840-dk', pinName: 'P1.01', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'DT', x: 0, y: 0 }, color: '#10b981', waypoints: [] },
  { id: 'w-P1.02-SW', start: { componentId: 'nrf52840-dk', pinName: 'P1.02', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'SW', x: 0, y: 0 }, color: '#3b82f6', waypoints: [] },
  { id: 'w-vcc', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'VCC', x: 0, y: 0 }, color: '#ef4444', waypoints: [] },
  { id: 'w-gnd', start: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, end: { componentId: 'ENC1', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
