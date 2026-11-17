import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const MAX32664_ADDRESS = 0x55;

interface BioReading {
  heartRate: number;
  confidence: number;
  oxygen: number;
  status: number;
  rValue: number;
  extStatus: number;
}

const RANGES: Record<string, [number, number]> = {
  heartRate: [0, 511],
  confidence: [0, 100],
  oxygen: [0, 100],
  status: [0, 3],
  rValue: [0, 6553],
  extStatus: [-128, 127],
};

PartSimulationRegistry.register('max32664', {
  attachEvents: (element, simulator, getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    const el = element as HTMLElement & BioReading;

    const reading = (): BioReading => ({
      heartRate: el.heartRate,
      confidence: el.confidence,
      oxygen: el.oxygen,
      status: el.status,
      rValue: el.rValue,
      extStatus: el.extStatus,
    });

    const applyValues = (values: Record<string, unknown>) => {
      const next: Record<string, number> = {};
      for (const [key, value] of Object.entries(values)) {
        if (key === 'irLed' || key === 'redLed') {
          throw new Error(`max32664: ${key} is a fixed LED count and cannot be set`);
        }
        const range = RANGES[key];
        if (!range) throw new Error(`max32664: unknown property "${key}"`);
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`max32664: ${key} must be a finite number, got ${value}`);
        }
        if (value < range[0] || value > range[1]) {
          throw new Error(
            `max32664: ${key} must be in ${range[0]}..${range[1]}, got ${value}`,
          );
        }
        next[key] = value;
      }
      Object.assign(el, next);
    };

    // The command state machine is embedgym_parts/i2c/max32664.py's MAX32664Slave, in
    // the backend worker or, on the AVR, in Pyodide, with the RST / MFIO GPIOs
    // whose levels it samples for the reset dance.
    const virtualPin = 200 + MAX32664_ADDRESS;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // Checked only here: the shared coverage test mounts every part on a bare mock element.
    if (typeof el.heartRate !== 'number') {
      throw new Error('max32664: element does not carry heartRate state (wrong element for metadataId)');
    }
    applyValues({ ...reading() });
    const rstPin = getPin('RST');
    const mfioPin = getPin('MFIO');
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    const native = sim.registerSensor('max32664', virtualPin, {
      addr: MAX32664_ADDRESS,
      ...reading(),
      ...(rstPin === null ? {} : { rst_pin: rstPin }),
      ...(mfioPin === null ? {} : { mfio_pin: mfioPin }),
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
