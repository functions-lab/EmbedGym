import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const RANGES: Record<string, [number, number]> = {
  temperature: [-40, 85],
  pressure: [300, 1100],
  humidity: [0, 100],
};
const DEFAULTS = { temperature: 25, pressure: 1013.25, humidity: 50 };

function parseAddress(raw: unknown): number {
  if (raw === undefined || raw === '0x76' || raw === 0x76) return 0x76;
  if (raw === '0x77' || raw === 0x77) return 0x77;
  throw new Error(`bme280: address must be 0x76 or 0x77, got ${raw}`);
}

function checkValues(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    const range = RANGES[key];
    if (range === undefined) throw new Error(`bme280: unknown property "${key}"`);
    if (typeof value !== 'number' || !(value >= range[0] && value <= range[1])) {
      throw new Error(`bme280: ${key} must be ${range[0]}…${range[1]}, got ${value}`);
    }
  }
}

// The register file is embedgym_parts/i2c/bme280.py's BME280Slave, in the backend
// worker or, on the AVR, in Pyodide. A wired CS pin means 4-wire SPI selected
// by that pin, otherwise I2C at 0x76 (0x77 via the element's `address`).
PartSimulationRegistry.register('bme280', {
  attachEvents: (element, simulator, getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    const el = element as HTMLElement & { address?: unknown };
    const address = parseAddress(el.address);
    const csPin = getPin('CS');

    if (typeof sim.registerSensor !== 'function') {
      if (csPin !== null) throw new Error('bme280: CS is wired but this board has no SPI slave support');
      return () => {};
    }
    const sensorPin = csPin ?? 200 + address;
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    const native = sim.registerSensor('bme280', sensorPin, {
      ...(csPin === null ? { addr: address } : { transport: 'spi' }),
      ...DEFAULTS,
    }) === true;
    if (!native) return () => {};
    registerSensorUpdate(componentId, (values) => {
      checkValues(values);
      sim.updateSensor(sensorPin, values);
    });
    return () => {
      sim.unregisterSensor(sensorPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
