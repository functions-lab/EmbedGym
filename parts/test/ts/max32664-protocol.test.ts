import { describe, it, expect, vi } from 'vitest';
import '../../sim/Max32664';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

describe('max32664 part — attachEvents', () => {
  const logic = PartSimulationRegistry.get('max32664');
  const READING_PROPS = {
    heartRate: 72,
    confidence: 95,
    oxygen: 98,
    status: 3,
    rValue: 12.5,
    extStatus: 0,
  };
  const element = () => ({ ...READING_PROPS });

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  /** The circuit's board pins: RST on GPIO4, MFIO on GPIO5 (null = unwired). */
  const wired = (pin: string) => ({ RST: 4, MFIO: 5 } as Record<string, number>)[pin] ?? null;

  function attach(el: object, sim: object, id: string, getPin: (pin: string) => number | null = wired) {
    if (logic?.attachEvents === undefined) throw new Error('max32664 part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(el as HTMLElement, sim as any, getPin, id);
  }

  it('a simulator without registerSensor stays inert', () => {
    let detach: (() => void) | undefined;
    expect(() => {
      detach = attach({}, {}, 'BIO-bare');
    }).not.toThrow();
    expect(() => detach!()).not.toThrow();
  });

  it('registers the worker slave at virtual pin 200 + address with the reading and both pins', () => {
    const sim = fakeBridgeSim();
    const detach = attach(element(), sim, 'BIO-esp');
    expect(sim.registerSensor).toHaveBeenCalledWith('max32664', 200 + 0x55, {
      addr: 0x55,
      ...READING_PROPS,
      rst_pin: 4,
      mfio_pin: 5,
    });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x55);
  });

  it('an unwired RST or MFIO is left out, for the shim to refuse', () => {
    const sim = fakeBridgeSim();
    attach(element(), sim, 'BIO-esp-unwired', () => null);
    expect(sim.registerSensor).toHaveBeenCalledWith('max32664', 200 + 0x55, { addr: 0x55, ...READING_PROPS });
  });

  it('an element without a reading raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({}, sim, 'BIO-esp-bad')).toThrow(/heartRate state/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('an out-of-range element value raises before anything registers', () => {
    const sim = fakeBridgeSim();
    expect(() => attach({ ...element(), status: 9 }, sim, 'BIO-esp-range')).toThrow(/0\.\.3/);
    expect(sim.registerSensor).not.toHaveBeenCalled();
  });

  it('a set reaches the worker slave and the element; an invalid value reaches neither', () => {
    const sim = fakeBridgeSim();
    const el = element();
    attach(el, sim, 'BIO-esp-set');
    dispatchSensorUpdate('BIO-esp-set', { heartRate: 128, oxygen: 91 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x55, { heartRate: 128, oxygen: 91 });
    expect(el.heartRate).toBe(128);
    expect(el.oxygen).toBe(91);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('BIO-esp-set', { heartRate: 600 })).toThrow(/0\.\.511/);
    expect(() => dispatchSensorUpdate('BIO-esp-set', { irLed: 5000 })).toThrow(/fixed LED count/);
    expect(() => dispatchSensorUpdate('BIO-esp-set', { pulse: 5 })).toThrow(/unknown property/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeBridgeSim(false);
    attach(element(), sim, 'BIO-declined');
    expect(hasSensorUpdateHandler('BIO-declined')).toBe(false);
  });
});
