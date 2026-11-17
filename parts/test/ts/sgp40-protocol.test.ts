import { describe, it, expect, vi } from 'vitest';
import '../../sim/Sgp40';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

describe('sgp40 part — attachEvents', () => {
  const logic = PartSimulationRegistry.get('sgp40');

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  function attach(element: object, sim: object, id: string) {
    if (logic?.attachEvents === undefined) throw new Error('sgp40 part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(element as HTMLElement, sim as any, () => null, id);
  }

  it('a simulator without registerSensor stays inert', () => {
    let detach: (() => void) | undefined;
    expect(() => {
      detach = attach({}, { getCurrentCycles: () => 0 }, 'GAS-bare');
    }).not.toThrow();
    expect(() => detach!()).not.toThrow();
  });

  it('registers the worker slave at virtual pin 200 + address with the raw signal', () => {
    const sim = fakeBridgeSim();
    const detach = attach({ raw: 31000 }, sim, 'GAS-esp');
    expect(sim.registerSensor).toHaveBeenCalledWith('sgp40', 200 + 0x59, { addr: 0x59, raw: 31000 });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x59);
  });

  it('an element without raw raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({}, sim, 'GAS-esp-bad')).toThrow(/raw state/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('an out-of-range element value raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({ raw: -1 }, sim, 'GAS-esp-range')).toThrow(/0\.\.65535/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('a set reaches the worker slave and the element; an invalid value reaches neither', () => {
    const sim = fakeBridgeSim();
    const el = { raw: 30000 };
    attach(el, sim, 'GAS-esp-set');
    dispatchSensorUpdate('GAS-esp-set', { raw: 41234 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x59, { raw: 41234 });
    expect(el.raw).toBe(41234);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('GAS-esp-set', { raw: 70000 })).toThrow(/0\.\.65535/);
    expect(() => dispatchSensorUpdate('GAS-esp-set', { voc: 5 })).toThrow(/unknown property/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeBridgeSim(false);
    attach({ raw: 30000 }, sim, 'GAS-declined');
    expect(hasSensorUpdateHandler('GAS-declined')).toBe(false);
  });
});
