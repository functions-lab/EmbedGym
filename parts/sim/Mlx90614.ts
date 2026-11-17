import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

type Temperatures = { objectTemperature: number; ambientTemperature: number };

const RANGES: Record<keyof Temperatures, [number, number]> = {
  objectTemperature: [-70, 380],
  ambientTemperature: [-40, 125],
};

PartSimulationRegistry.register('mlx90614', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    const sim = simulator as any;
    const el = element as HTMLElement & Temperatures;
    const apply = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key !== 'objectTemperature' && key !== 'ambientTemperature') {
          throw new Error(`mlx90614: unknown property "${key}"`);
        }
        const [low, high] = RANGES[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
          throw new Error(`mlx90614: ${key} must be a number within ${low}..${high} °C`);
        }
        el[key] = value;
      }
    };

    // SMBus, PEC, RAM and EEPROM are embedgym_parts/i2c/mlx90614.py's MLX90614Slave,
    // in the backend worker or, on the AVR, in Pyodide.
    const virtualPin = 200 + 0x5a;
    if (typeof sim.registerSensor !== 'function') return () => {};
    const temperatures = { objectTemperature: el.objectTemperature, ambientTemperature: el.ambientTemperature };
    apply(temperatures);
    const native = sim.registerSensor('mlx90614', virtualPin, { addr: 0x5a, ...temperatures }) === true;
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
