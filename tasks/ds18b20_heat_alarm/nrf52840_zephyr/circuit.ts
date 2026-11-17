import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

// Per the overlay's gpios cells: DS18B20 data = P0.03, buzzer = P1.15, LED = P1.12
export const components = [
  { id: 'DS1', metadataId: 'ds18b20', x: 720, y: 120 },
  { id: 'BZ1', metadataId: 'buzzer', x: 890, y: 90 },
  { id: 'R1', metadataId: 'resistor', x: 975, y: 160, properties: { value: '220' } },
  { id: 'L1', metadataId: 'led', x: 1055, y: 120, properties: { color: 'red' } },
];

export const wires: Wire[] = [
  { id: 'w-P0.03-data', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'data', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-VDD-VCC', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 },
    end: { componentId: 'DS1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-DS1-GND', start: { componentId: 'DS1', pinName: 'GND', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.15-BZ1', start: { componentId: 'nrf52840-dk', pinName: 'P1.15', x: 0, y: 0 },
    end: { componentId: 'BZ1', pinName: '1', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-BZ1-GND', start: { componentId: 'BZ1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P1.12-R1', start: { componentId: 'nrf52840-dk', pinName: 'P1.12', x: 0, y: 0 },
    end: { componentId: 'R1', pinName: '1', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-R1-L1', start: { componentId: 'R1', pinName: '2', x: 0, y: 0 },
    end: { componentId: 'L1', pinName: 'A', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-L1-GND', start: { componentId: 'L1', pinName: 'C', x: 0, y: 0 },
    end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
