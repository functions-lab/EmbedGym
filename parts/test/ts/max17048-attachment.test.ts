// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import '../../elements/Max17048Element';
import '../../sim/Max17048';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

type LithiumCellState = {
  batteryConnected: boolean; cellVoltage: number; openCircuitVoltage: number; stateOfCharge: number; chargeRate: number;
};

describe('MAX17048 real element and bridge attachment', () => {
  it('renders real breakout dimensions and eight exact physical connector pad coordinates', () => {
    const el = document.createElement('velxio-max17048') as HTMLElement & LithiumCellState & { pinInfo: { name: string; x: number; y: number }[] };
    expect(el.shadowRoot?.querySelector('svg')?.getAttribute('width')).toBe('96');
    expect(el.shadowRoot?.querySelector('svg')?.getAttribute('height')).toBe('76.8');
    expect(el.pinInfo.map(({ name, x, y }) => [name, x, y])).toEqual([
      ['VIN', 24, 67.2], ['GND', 33.6, 67.2], ['SCL', 43.2, 67.2], ['SDA', 52.8, 67.2],
      ['INT', 62.4, 67.2], ['QStart', 72, 67.2], ['+', 43.2, 33.6], ['-', 52.8, 33.6],
    ]);
    expect(el.batteryConnected).toBe(false);
    expect(el.cellVoltage).toBe(3.8);
  });

  it('registers the worker slave at virtual pin 200 + 0x36 with the cell, bus lines, INT and QStart, and forwards controls', () => {
    const el = document.createElement('velxio-max17048') as HTMLElement & LithiumCellState;
    el.batteryConnected = true; el.stateOfCharge = 40;
    const sim = { registerSensor: vi.fn(() => true), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    const cleanup = PartSimulationRegistry.get('max17048')!.attachEvents!(el, sim as any,
      (name) => ({ SDA: 20, SCL: 21, INT: 4, QStart: 5 } as Record<string, number>)[name] ?? null, 'cell-bridge');
    expect(sim.registerSensor).toHaveBeenCalledWith('max17048', 200 + 0x36, {
      addr: 0x36, batteryConnected: true, cellVoltage: 3.8, openCircuitVoltage: 3.8,
      stateOfCharge: 40, chargeRate: 0, sda_pin: 20, scl_pin: 21, int_pin: 4, qstart_pin: 5,
    });
    dispatchSensorUpdate('cell-bridge', { chargeRate: -10, cellVoltage: 3.7 });
    expect(sim.updateSensor).toHaveBeenLastCalledWith(200 + 0x36, { chargeRate: -10, cellVoltage: 3.7 });
    expect(el.chargeRate).toBe(-10);
    dispatchSensorUpdate('cell-bridge', { toggleBattery: true });
    expect(sim.updateSensor).toHaveBeenLastCalledWith(200 + 0x36, { batteryConnected: false });
    expect(el.batteryConnected).toBe(false);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('cell-bridge', { stateOfCharge: 101 })).toThrow('stateOfCharge');
    expect(() => dispatchSensorUpdate('cell-bridge', { noSuchInput: 1 })).toThrow('noSuchInput');
    expect(sim.updateSensor).not.toHaveBeenCalled();
    cleanup();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x36);
    expect(hasSensorUpdateHandler('cell-bridge')).toBe(false);
  });

  it('registers no INT or QStart pin when unwired, and rejects unwired bus lines or a malformed cell before registering', () => {
    const el = document.createElement('velxio-max17048') as HTMLElement & LithiumCellState;
    const busOnly = (name: string) => ({ SDA: 20, SCL: 21 } as Record<string, number>)[name] ?? null;
    const sim = { registerSensor: vi.fn((_type: string, _pin: number, _props: object) => true), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    PartSimulationRegistry.get('max17048')!.attachEvents!(el, sim as any, busOnly, 'cell-bridge-unwired')();
    expect(sim.registerSensor.mock.calls[0][2]).not.toHaveProperty('int_pin');
    expect(sim.registerSensor.mock.calls[0][2]).not.toHaveProperty('qstart_pin');
    const invalid = document.createElement('velxio-max17048') as HTMLElement & LithiumCellState;
    invalid.cellVoltage = 5;
    const rejecting = { registerSensor: vi.fn(() => true), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    expect(() => PartSimulationRegistry.get('max17048')!.attachEvents!(el, rejecting as any, () => null, 'cell-bridge-nobus')).toThrow('SDA and SCL');
    expect(() => PartSimulationRegistry.get('max17048')!.attachEvents!(invalid, rejecting as any, busOnly, 'cell-bridge-invalid')).toThrow('cellVoltage');
    expect(rejecting.registerSensor).not.toHaveBeenCalled();
  });
});
