import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'nrf52840-dk', boardKind: 'nrf52840-dk', x: 60, y: 60 } as BoardInstance,
];

// R_PD holds P1.11 at GND while the switch is open, so idle reads LOW and a
// press (which connects the pin to VDD) reads HIGH.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 760, y: 440 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 860, y: 470 },
  { id: 'T1', metadataId: 'tmp36', x: 760, y: 320 },
  { id: 'LCD1', metadataId: 'lcd1602', x: 760, y: 120 },
];

// HD44780 4-bit per the overlay's gpios cells: RS=P0.04, E=P0.05, D4=P0.02, D5=P0.31, D6=P0.29, D7=P0.30
// TMP36 Vout on P0.03 = AIN1: channel@2 has zephyr,input-positive = <2> = NRF_SAADC_AIN1; button on P1.11
export const wires: Wire[] = [
  { id: 'w-P1.11-BTN', start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 }, end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-BTN-VDD', start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-P1.11-RPD', start: { componentId: 'nrf52840-dk', pinName: 'P1.11', x: 0, y: 0 }, end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RPD-GND', start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P0.03-Vout', start: { componentId: 'nrf52840-dk', pinName: 'P0.03', x: 0, y: 0 }, end: { componentId: 'T1', pinName: 'Vout', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-VDD-T1', start: { componentId: 'nrf52840-dk', pinName: 'VDD', x: 0, y: 0 }, end: { componentId: 'T1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-T1-GND', start: { componentId: 'T1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.2', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-P0.04-RS', start: { componentId: 'nrf52840-dk', pinName: 'P0.04', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'RS', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-P0.05-E', start: { componentId: 'nrf52840-dk', pinName: 'P0.05', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'E', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-P0.02-D4', start: { componentId: 'nrf52840-dk', pinName: 'P0.02', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D4', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-P0.31-D5', start: { componentId: 'nrf52840-dk', pinName: 'P0.31', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D5', x: 0, y: 0 }, color: '#8800ff', waypoints: [] },
  { id: 'w-P0.29-D6', start: { componentId: 'nrf52840-dk', pinName: 'P0.29', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D6', x: 0, y: 0 }, color: '#ffcc00', waypoints: [] },
  { id: 'w-P0.30-D7', start: { componentId: 'nrf52840-dk', pinName: 'P0.30', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D7', x: 0, y: 0 }, color: '#888888', waypoints: [] },
  { id: 'w-5V-VDD', start: { componentId: 'nrf52840-dk', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LCD-VSS', start: { componentId: 'LCD1', pinName: 'VSS', x: 0, y: 0 }, end: { componentId: 'nrf52840-dk', pinName: 'GND.1', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
