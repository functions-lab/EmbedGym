import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

function checkDistance(cm: unknown): number {
  if (typeof cm !== 'number' || !(cm >= 2 && cm <= 400)) {
    throw new Error(`hc-sr04: distance ${cm} cm is outside 2..400`);
  }
  return cm;
}

// Overrides SensorParts' hc-sr04: the ranger is embedgym_parts/hc_sr04.py's HcSr04, in
// the backend worker or, on the AVR, in Pyodide.
PartSimulationRegistry.register('hc-sr04', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    const trig = getPin('TRIG');
    const echo = getPin('ECHO');
    if (trig === null) return () => {};
    const el = element as any;

    if (typeof sim.registerSensor !== 'function') return () => {};
    const distance = checkDistance(el.distance === undefined ? 10 : parseFloat(el.distance));
    // An unwired ECHO is left out, and the model rejects the part.
    const fields = { distance, ...(echo === null ? {} : { echo_pin: echo }) };
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('hc-sr04', trig, fields) !== true) return () => {};
    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key !== 'distance') throw new Error(`hc-sr04: unknown property "${key}"`);
        checkDistance(value);
      }
      sim.updateSensor(trig, values);
    });
    return () => {
      sim.unregisterSensor(trig);
      unregisterSensorUpdate(componentId);
    };
  },
});
