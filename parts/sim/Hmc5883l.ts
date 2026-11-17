import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

type Field = { magneticX: number; magneticY: number; magneticZ: number };

PartSimulationRegistry.register('hmc5883l', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    const el = element as HTMLElement & Field;
    const apply = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'magneticX' || key === 'magneticY' || key === 'magneticZ') {
          if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100) {
            throw new Error(`hmc5883l: ${key} must be finite and within -100..100 gauss`);
          }
          el[key] = value;
        } else {
          throw new Error(`hmc5883l: unknown property "${key}"`);
        }
      }
    };
    const drdy = getPin('DRDY');

    // The register file, measurement clock and DRDY are embedgym_parts/i2c/hmc5883l.py's
    // HMC5883LSlave, in the backend worker or, on the AVR, in Pyodide.
    const virtualPin = 200 + 0x1e;
    if (typeof sim.registerSensor !== 'function') return () => {};
    const field = { magneticX: el.magneticX, magneticY: el.magneticY, magneticZ: el.magneticZ };
    apply(field);
    const native = sim.registerSensor('hmc5883l', virtualPin, {
      addr: 0x1e,
      ...field,
      ...(drdy === null ? {} : { int_pin: drdy }),
    }) === true;
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (!native) return () => {};
    registerSensorUpdate(componentId, (values) => {
      apply(values);
      sim.updateSensor(virtualPin, values);
    });
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
