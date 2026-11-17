import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

type ThermalInputs = Record<string, number | boolean> & {
  thermistorTemperature: number;
  pixelAdcOverflow: boolean;
};

function applyThermalInputs(inputs: ThermalInputs, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (key === 'pixelAdcOverflow') {
      if (typeof value !== 'boolean') throw new Error('amg8833: pixelAdcOverflow must be boolean');
    } else if (key === 'thermistorTemperature' || /^pixel(?:[0-9]|[1-5][0-9]|6[0-3])$/.test(key)) {
      const min = key === 'thermistorTemperature' ? -20 : -512;
      const max = key === 'thermistorTemperature' ? 80 : 511.75;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new Error(`amg8833: ${key} must be finite and within ${min}..${max} C`);
      }
    } else {
      throw new Error(`amg8833: unknown input "${key}"`);
    }
  }
  Object.assign(inputs, values);
}

PartSimulationRegistry.register('amg8833', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    const el = element as HTMLElement & ThermalInputs & { address: number | string };
    const intPin = getPin('INT');

    // The register file, frame clock and INT are embedgym_parts/i2c/amg8833.py's
    // AMG8833Slave, in the backend worker or, on the AVR, in Pyodide.
    if (typeof sim.registerSensor !== 'function') return () => {};
    const address = el.address === 0x69 || el.address === '0x69' ? 0x69 :
      el.address === 0x68 || el.address === '0x68' ? 0x68 : null;
    if (address === null) throw new Error('amg8833: address must be 0x68 or 0x69');
    const virtualPin = 200 + address;
    const inputs: Record<string, unknown> = {
      thermistorTemperature: el.thermistorTemperature, pixelAdcOverflow: el.pixelAdcOverflow,
      ...Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`pixel${i}`, el[`pixel${i}`]])),
    };
    applyThermalInputs(el, inputs);
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    const native = sim.registerSensor('amg8833', virtualPin, {
      addr: address,
      ...inputs,
      ...(intPin === null ? {} : { int_pin: intPin }),
    }) === true;
    if (!native) return () => {};
    registerSensorUpdate(componentId, (values) => {
      applyThermalInputs(el, values);
      sim.updateSensor(virtualPin, values);
    });
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
