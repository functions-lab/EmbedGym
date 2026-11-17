import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance,
];

// R_PD holds pin 2 at GND while the switch is open, so idle reads LOW and a
// press (which connects the pin to 5V) reads HIGH.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 100, y: 135 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 187, y: 169 },
  { id: 'T1', metadataId: 'tmp36', x: 266, y: 104 },
  { id: 'LCD1', metadataId: 'lcd1602', x: 346, y: 44 },
];

// LiquidCrystal(RS=12, E=11, D4=4, D5=5, D6=6, D7=7); TMP36 on A0;
// button on D2 (external interrupt).
export const wires: Wire[] = [
  { id: 'w-2-BTN',   start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-BTN-5V', start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-2-RPD',   start: { componentId: 'arduino-mega', pinName: '2', x: 0, y: 0 }, end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RPD-GND',  start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-A0-Vout', start: { componentId: 'arduino-mega', pinName: 'A0', x: 0, y: 0 }, end: { componentId: 'T1', pinName: 'Vout', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-5V-T1',   start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'T1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-T1-GND',  start: { componentId: 'T1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-12-RS', start: { componentId: 'arduino-mega', pinName: '12', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'RS', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-11-E',  start: { componentId: 'arduino-mega', pinName: '11', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'E',  x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-4-D4',  start: { componentId: 'arduino-mega', pinName: '4',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D4', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-5-D5',  start: { componentId: 'arduino-mega', pinName: '5',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D5', x: 0, y: 0 }, color: '#8800ff', waypoints: [] },
  { id: 'w-6-D6',  start: { componentId: 'arduino-mega', pinName: '6',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D6', x: 0, y: 0 }, color: '#ffcc00', waypoints: [] },
  { id: 'w-7-D7',  start: { componentId: 'arduino-mega', pinName: '7',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D7', x: 0, y: 0 }, color: '#888888', waypoints: [] },
  { id: 'w-5V-VDD', start: { componentId: 'arduino-mega', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LCD-VSS', start: { componentId: 'LCD1', pinName: 'VSS', x: 0, y: 0 }, end: { componentId: 'arduino-mega', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
