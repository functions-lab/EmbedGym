import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

const PROPERTIES = new Set(['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ', 'temp']);

// Replaces ProtocolParts.ts's mpu6050 (last registration wins): the register
// file is embedgym_parts/i2c/mpu6050.py's MPU6050Slave, in the backend worker or, on
// the AVR, in Pyodide.
PartSimulationRegistry.register('mpu6050', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    const sim = simulator as any;
    const el = element as HTMLElement & { ad0?: unknown };
    const addr = el.ad0 === true || el.ad0 === 'true' ? 0x69 : 0x68;
    const check = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (!PROPERTIES.has(key)) throw new Error(`mpu6050: unknown property "${key}"`);
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`mpu6050: ${key} must be a finite number, got ${value}`);
        }
      }
    };

    const virtualPin = 200 + addr;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('mpu6050', virtualPin, { addr }) !== true) return () => {};
    registerSensorUpdate(componentId, (values) => {
      check(values);
      sim.updateSensor(virtualPin, values);
    });
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
