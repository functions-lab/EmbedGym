import { describe, expect, it, vi } from 'vitest';
import '@velxio/simulation/parts';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

function fakeSim(accepts = true) {
  return {
    registerSensor: vi.fn(() => accepts),
    updateSensor: vi.fn(),
    unregisterSensor: vi.fn(),
  };
}

function attach(type: string, element: object, sim: object, id: string, pins: Record<string, number> = {}) {
  const logic = PartSimulationRegistry.get(type);
  if (logic?.attachEvents === undefined) throw new Error(`${type} part not registered`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return logic.attachEvents(element as HTMLElement, sim as any, (p) => pins[p] ?? null, id);
}

describe('mpu6050 part (local)', () => {
  it('registers at 200 + its AD0 address and adds no frontend device', () => {
    const sim = { ...fakeSim(), addI2CDevice: vi.fn() };
    const detach = attach('mpu6050', { ad0: true }, sim, 'IMU-ad0');
    expect(sim.registerSensor).toHaveBeenCalledWith('mpu6050', 200 + 0x69, { addr: 0x69 });
    expect(sim.addI2CDevice).not.toHaveBeenCalled();
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x69);
  });

  it('forwards a finite value and rejects unknown or non-finite ones before forwarding', () => {
    const sim = fakeSim();
    attach('mpu6050', {}, sim, 'IMU-set');
    dispatchSensorUpdate('IMU-set', { accelZ: 0.5 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x68, { accelZ: 0.5 });
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate('IMU-set', { temperature: 30 })).toThrow(/unknown property "temperature"/);
    expect(() => dispatchSensorUpdate('IMU-set', { gyroX: Infinity })).toThrow(/gyroX must be a finite number/);
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });
});

describe('ds1307 part (local)', () => {
  it('registers at 200 + 0x68, forwards epoch and running and rejects anything else', () => {
    const sim = { ...fakeSim(), addI2CDevice: vi.fn() };
    const detach = attach('ds1307', {}, sim, 'RTC-set');
    expect(sim.registerSensor).toHaveBeenCalledWith('ds1307', 200 + 0x68, { addr: 0x68 });
    expect(sim.addI2CDevice).not.toHaveBeenCalled();
    dispatchSensorUpdate('RTC-set', { epoch: 1_700_000_000 });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x68, { epoch: 1_700_000_000 });
    expect(() => dispatchSensorUpdate('RTC-set', { hour: 3 })).toThrow(/unknown property "hour"/);
    expect(() => dispatchSensorUpdate('RTC-set', { epoch: NaN })).toThrow(/epoch must be a finite number/);
    dispatchSensorUpdate('RTC-set', { running: true });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + 0x68, { running: true });
    expect(() => dispatchSensorUpdate('RTC-set', { running: 1 })).toThrow(/running must be true or false/);
    detach();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x68);
  });

  it('throws when SQW is wired', () => {
    expect(() => attach('ds1307', {}, fakeSim(), 'RTC-sqw', { SQW: 7 })).toThrow(/SQW is wired/);
  });

  it('a declining registerSensor (AVR before loadHex) stays inert', () => {
    const sim = fakeSim(false);
    attach('ds1307', {}, sim, 'RTC-declined');
    dispatchSensorUpdate('RTC-declined', { epoch: 0 });
    expect(sim.updateSensor).not.toHaveBeenCalled();
  });
});
