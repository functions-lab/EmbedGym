import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const PMSA003I_ADDRESS = 0x12;
const MAX_UGM3 = 1000;

interface PmState {
  pm1_0: number;
  pm2_5: number;
  pm10: number;
}

PartSimulationRegistry.register('pmsa003i', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    const el = element as HTMLElement & PmState;
    const currentPm = (): PmState => ({ pm1_0: el.pm1_0, pm2_5: el.pm2_5, pm10: el.pm10 });

    const applyValues = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'pm1_0' || key === 'pm2_5' || key === 'pm10') {
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_UGM3) {
            throw new Error(`pmsa003i: ${key} must be a number in 0–${MAX_UGM3} µg/m³, got ${value}`);
          }
          el[key] = value;
        } else {
          throw new Error(`pmsa003i: unknown property "${key}"`);
        }
      }
    };

    // The frame is embedgym_parts/i2c/pmsa003i.py's PMSA003ISlave, in the backend
    // worker or, on the AVR, in Pyodide.
    const virtualPin = 200 + PMSA003I_ADDRESS;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // Checked only here: the shared coverage test mounts every part on a bare mock element.
    if (typeof el.pm1_0 !== 'number' || typeof el.pm2_5 !== 'number' || typeof el.pm10 !== 'number') {
      throw new Error('pmsa003i: element does not carry PM state (wrong element for metadataId)');
    }
    applyValues({ ...currentPm() });
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('pmsa003i', virtualPin, { addr: PMSA003I_ADDRESS, ...currentPm() }) !== true) return () => {};
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
