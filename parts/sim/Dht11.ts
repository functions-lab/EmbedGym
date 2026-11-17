import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';

// The rated range, so the frame's negative-sign bit is never set.
const RANGES: Record<string, readonly [number, number]> = { temperature: [0, 50], humidity: [20, 90] };

PartSimulationRegistry.register('dht11', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    const pin = getPin('DATA');
    if (pin === null) return () => {};
    const el = element as any;
    const check = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        const range = RANGES[key];
        if (range === undefined) throw new Error(`dht11: unknown property "${key}"`);
        if (typeof value !== 'number' || !(value >= range[0] && value <= range[1])) {
          throw new Error(`dht11: ${key} must be ${range[0]}…${range[1]}, got ${value}`);
        }
      }
    };
    const apply = (values: Record<string, unknown>) => {
      check(values);
      for (const [key, value] of Object.entries(values)) {
        el[key] = value;
        emitPropertyChange(componentId, key, value);
      }
    };

    // The handshake and frame are embedgym_parts/dht11.py's Dht11Slave, in the backend
    // worker or, on the AVR, in Pyodide.
    if (typeof sim.registerSensor !== 'function') return () => {};
    const initial = {
      temperature: typeof el.temperature === 'number' ? el.temperature : 25,
      humidity: typeof el.humidity === 'number' ? el.humidity : 50,
    };
    check(initial);
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('dht11', pin, initial) !== true) return () => {};
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
