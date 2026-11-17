import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const LTR390_ADDR = 0x53;
const MAX_COUNT = 0xfffff; // 20-bit data registers

PartSimulationRegistry.register('ltr390', {
  attachEvents: (element, simulator, getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    const el = element as HTMLElement & { als: number; uvs: number };

    const applyValues = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'als' || key === 'uvs') {
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_COUNT) {
            throw new Error(`ltr390: ${key} must be a number in 0..${MAX_COUNT}, got ${value}`);
          }
          el[key] = value;
        } else {
          throw new Error(`ltr390: unknown property "${key}"`);
        }
      }
    };

    // The register file, conversion clock and INT line are
    // embedgym_parts/i2c/ltr390.py's LTR390Slave, in the backend worker or, on the AVR,
    // in Pyodide.
    const intPin = getPin('INT');
    const virtualPin = 200 + LTR390_ADDR;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // Checked only here: the shared coverage test mounts every part on a bare mock element.
    if (typeof el.als !== 'number' || typeof el.uvs !== 'number') {
      throw new Error('ltr390: element does not carry als/uvs state (wrong element for metadataId)');
    }
    applyValues({ als: el.als, uvs: el.uvs });
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    const native = sim.registerSensor('ltr390', virtualPin, {
      addr: LTR390_ADDR,
      als: el.als,
      uvs: el.uvs,
      ...(intPin === null ? {} : { int_pin: intPin }),
    }) === true;
    if (!native) return () => {};
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
