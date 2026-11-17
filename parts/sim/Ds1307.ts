import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

// Replaces ProtocolParts.ts's ds1307 (last registration wins): the RTC is
// embedgym_parts/i2c/ds1307.py's DS1307Slave, in the backend worker or, on the AVR, in
// Pyodide. It powers on halted at 01/01/00 00:00:00 until the sketch clears
// CH; `set <role>.epoch = <seconds>` sets the time and
// `set <role>.running = true|false` clears or sets CH.
PartSimulationRegistry.register('ds1307', {
  attachEvents: (_element, simulator, getPin, componentId) => {
    if (getPin('SQW') !== null) {
      throw new Error('ds1307: SQW is wired, but the SQW/OUT output is not modeled');
    }
    const sim = simulator as any;
    const virtualPin = 200 + 0x68;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('ds1307', virtualPin, { addr: 0x68 }) !== true) return () => {};
    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'epoch') {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`ds1307: epoch must be a finite number of seconds, got ${value}`);
          }
        } else if (key === 'running') {
          if (typeof value !== 'boolean') throw new Error(`ds1307: running must be true or false, got ${value}`);
        } else {
          throw new Error(`ds1307: unknown property "${key}"`);
        }
      }
      sim.updateSensor(virtualPin, values);
    });
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
