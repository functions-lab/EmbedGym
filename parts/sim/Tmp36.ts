/**
 * Tmp36.ts — TMP36 analog temperature sensor.
 *
 * Vout = 0.5 V + 0.01 V/°C · T (datasheet), so 25 °C → 0.75 V and the
 * −40…125 °C range spans 0.1…1.75 V. Default 25 °C.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { setAdcVoltage, emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

const toVolts = (temperature: number) => 0.5 + 0.01 * temperature;

PartSimulationRegistry.register('tmp36', {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const pin = getArduinoPinHelper('Vout');
    const el = element as any;

    const applyTemperature = (value: unknown) => {
      if (typeof value !== 'number' || value < -40 || value > 125) {
        throw new Error(`tmp36: temperature must be -40…125, got ${value}`);
      }
      el.temperature = value;
      if (pin !== null) setAdcVoltage(simulator, pin, toVolts(value));
      emitPropertyChange(componentId, 'temperature', value);
    };

    applyTemperature(typeof el.temperature === 'number' ? el.temperature : 25);

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'temperature') {
          applyTemperature(value);
        } else {
          throw new Error(`tmp36: unknown property "${key}"`);
        }
      }
    });

    return () => {
      unregisterSensorUpdate(componentId);
    };
  },
});
