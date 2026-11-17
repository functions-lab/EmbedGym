import { describe, it, expect } from 'vitest';
import { boardPinsByComponent, type CircuitLike } from '../resolve_role';

describe('boardPinsByComponent', () => {
  it('traces through resistors, skips rails and keeps wire order', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'BTN1', metadataId: 'pushbutton' },
        { id: 'R_PD', metadataId: 'resistor-10k' },
        { id: 'R1', metadataId: 'resistor' },
        { id: 'L1', metadataId: 'led' },
        { id: 'LCD1', metadataId: 'lcd1602' },
      ],
      wires: [
        { start: { componentId: 'arduino-mega', pinName: '12' }, end: { componentId: 'LCD1', pinName: 'RS' } },
        { start: { componentId: 'arduino-mega', pinName: '11' }, end: { componentId: 'LCD1', pinName: 'E' } },
        { start: { componentId: 'arduino-mega', pinName: '5V' }, end: { componentId: 'LCD1', pinName: 'VDD' } },
        { start: { componentId: 'arduino-mega', pinName: '2' }, end: { componentId: 'BTN1', pinName: '1.l' } },
        { start: { componentId: 'arduino-mega', pinName: '2' }, end: { componentId: 'R_PD', pinName: '1' } },
        { start: { componentId: 'R_PD', pinName: '2' }, end: { componentId: 'arduino-mega', pinName: 'GND' } },
        { start: { componentId: 'BTN1', pinName: '2.l' }, end: { componentId: 'arduino-mega', pinName: '5V' } },
        { start: { componentId: 'arduino-mega', pinName: '13' }, end: { componentId: 'R1', pinName: '1' } },
        { start: { componentId: 'R1', pinName: '2' }, end: { componentId: 'L1', pinName: 'A' } },
        { start: { componentId: 'L1', pinName: 'C' }, end: { componentId: 'arduino-mega', pinName: 'GND' } },
      ],
    };
    expect(boardPinsByComponent(circuit, 'arduino-mega')).toEqual(new Map([
      ['LCD1', ['12', '11']],
      ['BTN1', ['2']],
      ['L1', ['13']],
    ]));
  });

  it('gives each part on a shared I2C bus both bus pins', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'AIR1', metadataId: 'pmsa003i' },
        { id: 'GAS1', metadataId: 'sgp40' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'AIR1', pinName: 'SDA' } },
        { start: { componentId: 'esp32-s3', pinName: '39' }, end: { componentId: 'AIR1', pinName: 'SCL' } },
        { start: { componentId: 'esp32-s3', pinName: '38' }, end: { componentId: 'GAS1', pinName: 'SDA' } },
        { start: { componentId: 'esp32-s3', pinName: '39' }, end: { componentId: 'GAS1', pinName: 'SCL' } },
      ],
    };
    expect(boardPinsByComponent(circuit, 'esp32-s3')).toEqual(new Map([
      ['AIR1', ['38', '39']],
      ['GAS1', ['38', '39']],
    ]));
  });

  it('traces through a level-shifter channel and leaves the shifter out', () => {
    const circuit: CircuitLike = {
      components: [
        { id: 'US1', metadataId: 'hc-sr04' },
        { id: 'LS1', metadataId: 'level-shifter' },
      ],
      wires: [
        { start: { componentId: 'esp32-s3', pinName: '43' }, end: { componentId: 'US1', pinName: 'TRIG' } },
        { start: { componentId: 'esp32-s3', pinName: '44' }, end: { componentId: 'LS1', pinName: 'LV1' } },
        { start: { componentId: 'LS1', pinName: 'HV1' }, end: { componentId: 'US1', pinName: 'ECHO' } },
        { start: { componentId: 'esp32-s3', pinName: '5V' }, end: { componentId: 'LS1', pinName: 'HV' } },
        { start: { componentId: 'esp32-s3', pinName: '3V3.1' }, end: { componentId: 'LS1', pinName: 'LV' } },
        { start: { componentId: 'esp32-s3', pinName: '5V' }, end: { componentId: 'US1', pinName: 'VCC' } },
      ],
    };
    expect(boardPinsByComponent(circuit, 'esp32-s3')).toEqual(new Map([['US1', ['43', '44']]]));
  });
});
