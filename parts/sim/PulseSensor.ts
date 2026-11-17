import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

// The PIR motion sensor (overriding SensorParts') and the shock sensor are
// embedgym_parts/pulse_sensor.py's PulseSensor through embedgym_parts/registry.py, in the backend
// worker or, on the AVR, in Pyodide. A click on the element, the sensor panel's
// button or the harness's `set` triggers one.
const PULSE_SENSORS = [
  { type: 'pir-motion-sensor', pinName: 'OUT', prop: 'trigger' },
  { type: 'shock-sensor', pinName: 'signal', prop: 'shock' },
];

for (const { type, pinName, prop } of PULSE_SENSORS) {
  PartSimulationRegistry.register(type, {
    attachEvents: (element, simulator, getPin, componentId) => {
      const sim = simulator as any;
      const pin = getPin(pinName);
      if (pin === null || typeof sim.registerSensor !== 'function') return () => {};
      // A reset re-attaches it idle. The AVR declines until its CPU and the
      // Python part models exist; the canvas then re-attaches the part.
      if (sim.registerSensor(type, pin, {}, undefined, () => ({})) !== true) return () => {};
      const trigger = () => sim.updateSensor(pin, { [prop]: true });
      element.addEventListener('click', trigger);
      registerSensorUpdate(componentId, (values) => sim.updateSensor(pin, values));
      return () => {
        element.removeEventListener('click', trigger);
        sim.unregisterSensor(pin);
        unregisterSensorUpdate(componentId);
      };
    },
  });
}
