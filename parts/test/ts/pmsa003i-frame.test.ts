import { describe, it, expect, vi } from 'vitest';
import '../../sim/Pmsa003i';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

describe('pmsa003i part — attachEvents', () => {
  const logic = PartSimulationRegistry.get('pmsa003i');
  const defaults = () => ({ pm1_0: 8, pm2_5: 12, pm10: 20 });

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  function attach(element: object, sim: object, id: string) {
    if (logic?.attachEvents === undefined) throw new Error('pmsa003i part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(element as HTMLElement, sim as any, () => null, id);
  }

  it('a simulator without registerSensor stays inert', () => {
    let detach: (() => void) | undefined;
    expect(() => {
      detach = attach({}, {}, 'AIR-bare');
    }).not.toThrow();
    expect(() => detach!()).not.toThrow();
  });

  it('registers the worker slave at virtual pin 200 + address with the PM state', () => {
    const sim = fakeBridgeSim();
    const detach = attach({ pm1_0: 35, pm2_5: 75, pm10: 150 }, sim, 'AIR-esp');
    expect(sim.registerSensor).toHaveBeenCalledWith('pmsa003i', 200 + 0x12, {
      addr: 0x12, pm1_0: 35, pm2_5: 75, pm10: 150,
    });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x12);
  });

  it('an element without PM state raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({}, sim, 'AIR-esp-bad')).toThrow(/PM state/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('a set reaches the worker slave and the element; an invalid value reaches neither', () => {
    const sim = fakeBridgeSim();
    const el = defaults();
    attach(el, sim, 'AIR-esp-set');
    dispatchSensorUpdate('AIR-esp-set', { pm2_5: 75 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x12, { pm2_5: 75 });
    expect(el).toEqual({ pm1_0: 8, pm2_5: 75, pm10: 20 });
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('AIR-esp-set', { pm10: 1001 })).toThrow(/0–1000/);
    expect(() => dispatchSensorUpdate('AIR-esp-set', { aqi: 5 })).toThrow(/unknown property/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
    expect(el.pm10).toBe(20);
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeBridgeSim(false);
    attach(defaults(), sim, 'AIR-declined');
    expect(hasSensorUpdateHandler('AIR-declined')).toBe(false);
  });
});
