import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';

export const boards: BoardInstance[] = [
  { id: 'arduino-uno', boardKind: 'arduino-uno', x: 100, y: 200 } as BoardInstance,
];

// R_PD holds pin 2 at GND while the switch is open, so idle reads LOW and a
// press (which connects the pin to 5V) reads HIGH.
export const components = [
  { id: 'BTN', metadataId: 'pushbutton', x: 100, y: 135 },
  { id: 'R_PD', metadataId: 'resistor-10k', x: 187, y: 169 },
  { id: 'SH1', metadataId: 'shock-sensor', x: 266, y: 120 },
  { id: 'LCD1', metadataId: 'lcd1602', x: 350, y: 44 },
];

// Button on D2 (INT0) starts the timer; shock sensor on D3 (INT1) stops it.
// LiquidCrystal(RS=12, E=11, D4=4, D5=5, D6=6, D7=7)
export const wires: Wire[] = [
  { id: 'w-2-BTN',   start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 }, end: { componentId: 'BTN', pinName: '1.l', x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-BTN-5V', start: { componentId: 'BTN', pinName: '2.l', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-2-RPD',   start: { componentId: 'arduino-uno', pinName: '2', x: 0, y: 0 }, end: { componentId: 'R_PD', pinName: '1', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-RPD-GND',  start: { componentId: 'R_PD', pinName: '2', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-3-signal', start: { componentId: 'arduino-uno', pinName: '3', x: 0, y: 0 }, end: { componentId: 'SH1', pinName: 'signal', x: 0, y: 0 }, color: '#00aaff', waypoints: [] },
  { id: 'w-5V-SH1',  start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'SH1', pinName: 'VCC', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-SH1-GND', start: { componentId: 'SH1', pinName: 'GND', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
  { id: 'w-12-RS', start: { componentId: 'arduino-uno', pinName: '12', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'RS', x: 0, y: 0 }, color: '#00aa00', waypoints: [] },
  { id: 'w-11-E',  start: { componentId: 'arduino-uno', pinName: '11', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'E',  x: 0, y: 0 }, color: '#0000ff', waypoints: [] },
  { id: 'w-4-D4',  start: { componentId: 'arduino-uno', pinName: '4',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D4', x: 0, y: 0 }, color: '#ff8800', waypoints: [] },
  { id: 'w-5-D5',  start: { componentId: 'arduino-uno', pinName: '5',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D5', x: 0, y: 0 }, color: '#8800ff', waypoints: [] },
  { id: 'w-6-D6',  start: { componentId: 'arduino-uno', pinName: '6',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D6', x: 0, y: 0 }, color: '#ffcc00', waypoints: [] },
  { id: 'w-7-D7',  start: { componentId: 'arduino-uno', pinName: '7',  x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'D7', x: 0, y: 0 }, color: '#888888', waypoints: [] },
  { id: 'w-5V-VDD', start: { componentId: 'arduino-uno', pinName: '5V', x: 0, y: 0 }, end: { componentId: 'LCD1', pinName: 'VDD', x: 0, y: 0 }, color: '#ff0000', waypoints: [] },
  { id: 'w-LCD-VSS', start: { componentId: 'LCD1', pinName: 'VSS', x: 0, y: 0 }, end: { componentId: 'arduino-uno', pinName: 'GND', x: 0, y: 0 }, color: '#000000', waypoints: [] },
];
