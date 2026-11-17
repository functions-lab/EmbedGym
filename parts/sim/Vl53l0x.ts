import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const VL53L0X_ADDR = 0x29;

PartSimulationRegistry.register('vl53l0x', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    const el = element as HTMLElement & { distance: number };

    const applyValues = (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'distance') {
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            throw new Error(`vl53l0x: distance must be a finite non-negative number, got ${value}`);
          }
          el.distance = value;
        } else {
          throw new Error(`vl53l0x: unknown property "${key}"`);
        }
      }
    };

    // The register file, ranging clock and 0x8A address move are
    // embedgym_parts/i2c/vl53l0x.py's VL53L0XSlave, in the backend worker or, on the
    // AVR, in Pyodide. It is registered at the virtual pin 200 + power-on
    // address; the pin stays when the address moves, so `set` keeps reaching it.
    const virtualPin = 200 + VL53L0X_ADDR;
    if (typeof sim.registerSensor !== 'function') return () => {};
    // Checked only here: the shared coverage test mounts every part on a bare mock element.
    if (typeof el.distance !== 'number') {
      throw new Error('vl53l0x: element does not carry distance state (wrong element for metadataId)');
    }
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('vl53l0x', virtualPin, { addr: VL53L0X_ADDR, distance: el.distance }) !== true) {
      return () => {};
    }
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
