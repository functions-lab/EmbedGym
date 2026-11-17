import { describe, expect, it, vi } from 'vitest';
import '../../sim/Hmc5883l';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

describe('hmc5883l part — bridge attach', () => {
  const logic = PartSimulationRegistry.get('hmc5883l');
  const DRDY_PIN = 5;

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  function attach(element: object, sim: object, drdy: number | null, id: string) {
    if (logic?.attachEvents === undefined) throw new Error('hmc5883l part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(element as HTMLElement, sim as any, (p) => (p === 'DRDY' ? drdy : null), id);
  }

  it('registers the worker slave at virtual pin 200 + 0x1E with the field and DRDY', () => {
    const sim = fakeBridgeSim();
    const detach = attach({ magneticX: 0.3, magneticY: -0.2, magneticZ: 0.1 }, sim, DRDY_PIN, 'MAG-bridge');
    expect(sim.registerSensor).toHaveBeenCalledWith('hmc5883l', 200 + 0x1e, {
      addr: 0x1e, magneticX: 0.3, magneticY: -0.2, magneticZ: 0.1, int_pin: DRDY_PIN,
    });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x1e);

    const unwired = fakeBridgeSim();
    attach({ magneticX: 1, magneticY: 2, magneticZ: 3 }, unwired, null, 'MAG-bridge-nodrdy');
    expect(unwired.registerSensor).toHaveBeenCalledWith('hmc5883l', 200 + 0x1e, {
      addr: 0x1e, magneticX: 1, magneticY: 2, magneticZ: 3,
    });
  });

  it('forwards a valid set to the worker and the element; an invalid one reaches neither', () => {
    const sim = fakeBridgeSim();
    const el = { magneticX: 0.3, magneticY: -0.2, magneticZ: 0.1 };
    attach(el, sim, null, 'MAG-bridge-set');
    dispatchSensorUpdate('MAG-bridge-set', { magneticY: 0.5 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x1e, { magneticY: 0.5 });
    expect(el.magneticY).toBe(0.5);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('MAG-bridge-set', { magneticZ: 101 })).toThrow(/magneticZ must be/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = { ...fakeBridgeSim(false), cpuInitialized: false };
    expect(() => attach({ magneticX: 0, magneticY: 0, magneticZ: 0 }, sim, null, 'MAG-declined')).not.toThrow();
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });
});
