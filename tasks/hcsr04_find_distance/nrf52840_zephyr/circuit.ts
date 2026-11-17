import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

export const components = [
  { id: 'US1', metadataId: 'hc-sr04', x: 720, y: 120 },
  { id: 'LS1', metadataId: 'level-shifter', x: 620, y: 250 },
];

// ECHO reaches P0.04 through LS1 channel 1, at 3.3 V.
export const wires: Wire[] = [
  { id: 'w-P0.05-TRIG', start: { componentId: 'nrf52840-dk', pinName: 'P0.05', x: 0, y: 0 },
    end: { componentId: 'US1', pinName: 'TRIG', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.04-LV1', start: { componentId: 'nrf52840-dk', pinName: 'P0.04', x: 0, y: 0 },
    end: { componentId: 'LS1', pinName: 'LV1', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-HV1-ECHO', start: { componentId: 'LS1', pinName: 'HV1', x: 0, y: 0 },
    end: { componentId: 'US1', pinName: 'ECHO', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-5V-HV', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'LS1', pinName: 'HV', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-VDD-LV', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    end: { componentId: 'LS1', pinName: 'LV', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-LS1-GND', start: { componentId: 'LS1', pinName: 'GND.1', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-5V-VCC', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 },
    end: { componentId: 'US1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-US1-GND', start: { componentId: 'US1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
