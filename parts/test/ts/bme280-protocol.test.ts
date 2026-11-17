import { describe, it, expect, vi } from 'vitest';
import '../../sim/Bme280';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

describe('bme280 part — bridge attach', () => {
  const logic = PartSimulationRegistry.get('bme280');

  function fakeBridgeSim(accepts = true) {
    return {
      registerSensor: vi.fn(() => accepts),
      updateSensor: vi.fn(),
      unregisterSensor: vi.fn(),
    };
  }

  function attach(element: object, sim: object, csPin: number | null, id: string) {
    if (logic?.attachEvents === undefined) throw new Error('bme280 part not registered');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logic.attachEvents(element as HTMLElement, sim as any, (pin) => (pin === 'CS' ? csPin : null), id);
  }

  it('registers the worker slave at virtual pin 200 + address with the power-on values', () => {
    const sim = fakeBridgeSim();
    const detach = attach({}, sim, null, 'ENV-bridge');
    expect(sim.registerSensor).toHaveBeenCalledWith('bme280', 200 + 0x76, {
      addr: 0x76,
      temperature: 25,
      pressure: 1013.25,
      humidity: 50,
    });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x76);
    expect(hasSensorUpdateHandler('ENV-bridge')).toBe(false);
    const sim77 = fakeBridgeSim();
    attach({ address: '0x77' }, sim77, null, 'ENV-bridge-77');
    expect(sim77.registerSensor).toHaveBeenCalledWith('bme280', 200 + 0x77, expect.objectContaining({ addr: 0x77 }));
  });

  it('rejects an address other than 0x76 / 0x77', () => {
    expect(() => attach({ address: '0x50' }, fakeBridgeSim(), null, 'ENV-bad-address')).toThrow(/0x76 or 0x77/);
  });

  it('forwards a valid set to the worker; an out-of-range or unknown value is rejected', () => {
    const sim = fakeBridgeSim();
    attach({}, sim, null, 'ENV-bridge-set');
    dispatchSensorUpdate('ENV-bridge-set', { temperature: 31, humidity: 64 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x76, { temperature: 31, humidity: 64 });
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('ENV-bridge-set', { temperature: 90 })).toThrow(/temperature must be/);
    expect(() => dispatchSensorUpdate('ENV-bridge-set', { humidity: -1 })).toThrow(/humidity must be/);
    expect(() => dispatchSensorUpdate('ENV-bridge-set', { altitude: 10 })).toThrow(/unknown property/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeBridgeSim(false);
    attach({}, sim, null, 'ENV-declined');
    expect(hasSensorUpdateHandler('ENV-declined')).toBe(false);
  });

  it('a wired CS registers the worker slave on the CS pin with the SPI transport', () => {
    const sim = fakeBridgeSim();
    const detach = attach({}, sim, 41, 'ENV-bridge-spi');
    expect(sim.registerSensor).toHaveBeenCalledWith('bme280', 41, {
      transport: 'spi', temperature: 25, pressure: 1013.25, humidity: 50,
    });
    dispatchSensorUpdate('ENV-bridge-spi', { temperature: 31 });
    expect(sim.updateSensor).toHaveBeenCalledWith(41, { temperature: 31 });
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(41);
  });

  it('a wired CS on a board without a worker raises', () => {
    expect(() => attach({}, {}, 41, 'ENV-no-worker')).toThrow(/SPI/);
  });
});
