import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

interface LithiumCellState {
  batteryConnected: boolean;
  cellVoltage: number;
  openCircuitVoltage: number;
  stateOfCharge: number;
  chargeRate: number;
}

function validateCell(state: LithiumCellState): void {
  if (typeof state.batteryConnected !== 'boolean') throw new Error('max17048: batteryConnected must be boolean');
  for (const [key, min, max] of [
    ['cellVoltage', 0, 4.5], ['openCircuitVoltage', 0, 4.5],
    ['stateOfCharge', 0, 100], ['chargeRate', -6815.744, 6815.536],
  ] as const) {
    const value = state[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`max17048: ${key} must be finite and within ${min}..${max}`);
    }
  }
}

PartSimulationRegistry.register('max17048', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    const el = element as HTMLElement & LithiumCellState;
    const intPin = getPin('INT');
    const resolveControls = (values: Record<string, unknown>) => {
      for (const key of Object.keys(values)) {
        if (!['batteryConnected', 'cellVoltage', 'openCircuitVoltage', 'stateOfCharge', 'chargeRate', 'toggleBattery'].includes(key)) {
          throw new Error(`max17048: unknown property "${key}"`);
        }
      }
      const applied = { ...values };
      if ('toggleBattery' in applied) {
        if (applied.toggleBattery !== true) throw new Error('max17048: toggleBattery requires true');
        delete applied.toggleBattery;
        applied.batteryConnected = !el.batteryConnected;
      }
      return applied as Partial<LithiumCellState>;
    };

    // The register file, acquisition clock, INT and the QStart and bus-line
    // inputs are embedgym_parts/i2c/max17048.py's MAX17048Slave, in the backend worker
    // or, on the AVR, in Pyodide.
    const virtualPin = 200 + 0x36;
    if (typeof sim.registerSensor !== 'function') return () => {};
    const cell = () => ({
      batteryConnected: el.batteryConnected, cellVoltage: el.cellVoltage,
      openCircuitVoltage: el.openCircuitVoltage, stateOfCharge: el.stateOfCharge, chargeRate: el.chargeRate,
    });
    validateCell(cell());
    const quickPin = getPin('QStart');
    const sdaPin = getPin('SDA');
    const sclPin = getPin('SCL');
    if (sdaPin === null || sclPin === null) throw new Error('max17048: SDA and SCL must be wired to the board');
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    const native = sim.registerSensor('max17048', virtualPin, {
      addr: 0x36,
      ...cell(),
      sda_pin: sdaPin,
      scl_pin: sclPin,
      ...(intPin === null ? {} : { int_pin: intPin }),
      ...(quickPin === null ? {} : { qstart_pin: quickPin }),
    }) === true;
    if (!native) return () => {};
    registerSensorUpdate(componentId, (values) => {
      const applied = resolveControls(values);
      validateCell({ ...cell(), ...applied });
      sim.updateSensor(virtualPin, applied);
      Object.assign(el, applied);
    });
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
