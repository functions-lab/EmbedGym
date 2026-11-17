import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';

function checkTemperature(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (key !== 'temperature') throw new Error(`ds18b20: unknown property "${key}"`);
    if (typeof value !== 'number' || !(value >= -55 && value <= 125)) {
      throw new Error(`ds18b20: temperature must be -55…125, got ${value}`);
    }
  }
}

PartSimulationRegistry.register('ds18b20', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    const pin = getPin('data');
    if (pin === null) return () => {};
    const el = element as any;
    const apply = (values: Record<string, unknown>) => {
      checkTemperature(values);
      for (const [key, value] of Object.entries(values)) {
        el[key] = value;
        emitPropertyChange(componentId, key, value);
      }
    };

    // The 1-Wire slave is embedgym_parts/ds18b20.py's Ds18b20Slave, in the backend
    // worker or, on the AVR, in Pyodide.
    if (typeof sim.registerSensor !== 'function') return () => {};
    const initial = { temperature: typeof el.temperature === 'number' ? el.temperature : 25 };
    checkTemperature(initial);
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('ds18b20', pin, initial) !== true) return () => {};
    apply(initial);
    registerSensorUpdate(componentId, (values) => {
      apply(values);
      sim.updateSensor(pin, values);
    });
    return () => {
      sim.unregisterSensor(pin);
      unregisterSensorUpdate(componentId);
    };
  },
});
