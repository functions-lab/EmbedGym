import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const SGP40_ADDRESS = 0x59;
const MAX_RAW = 0xffff;

PartSimulationRegistry.register('sgp40', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    const el = element as HTMLElement & { raw: number };

    const applyValues = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'raw') {
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_RAW) {
            throw new Error(`sgp40: raw must be a number in 0..${MAX_RAW}, got ${value}`);
          }
          el.raw = value;
        } else {
          throw new Error(`sgp40: unknown property "${key}"`);
        }
      }
    };

    // The command state machine and its execution-time clock are
    // embedgym_parts/i2c/sgp40.py's SGP40Slave, in the backend worker or, on the AVR,
    // in Pyodide.
    const virtualPin = 200 + SGP40_ADDRESS;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // Checked only here: the shared coverage test mounts every part on a bare mock element.
    if (typeof el.raw !== 'number') {
      throw new Error('sgp40: element does not carry raw state (wrong element for metadataId)');
    }
    applyValues({ raw: el.raw });
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('sgp40', virtualPin, { addr: SGP40_ADDRESS, raw: el.raw }) !== true) return () => {};
    registerSensorUpdate(componentId, (values) => {
      applyValues(values);
      sim.updateSensor(virtualPin, values);
    });
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
