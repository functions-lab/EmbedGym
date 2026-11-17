/**
 * Ky018Photoresistor.ts — KY-018 photoresistor light sensor module.
 *
 * The LDR and a fixed 10 kΩ resistor form a divider between VCC and GND, so
 * brighter light → lower LDR resistance → lower voltage on S. `lightLevel`
 * (0 = dark, 1023 = full bright) maps linearly onto S as VCC … 0 V. The level
 * reaches the ADC through the SPICE divider in `spice/ratiometricSensors.ts`.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { idleValue } from '@velxio/simulation/spice/ratiometricSensors';

PartSimulationRegistry.register('ky-018-photoresistor', {
  attachEvents: (element, _simulator, _getArduinoPinHelper, componentId) => {
    const el = element as any;

    const applyLightLevel = (value: unknown) => {
      if (typeof value !== 'number' || value < 0 || value > 1023) {
        throw new Error(`ky-018-photoresistor: lightLevel must be 0–1023, got ${value}`);
      }
      el.lightLevel = value;
      emitPropertyChange(componentId, 'lightLevel', value);
    };

    applyLightLevel(
      typeof el.lightLevel === 'number' ? el.lightLevel : idleValue('ky-018-photoresistor', 'lightLevel'),
    );

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'lightLevel') {
          applyLightLevel(value);
        } else {
          throw new Error(`ky-018-photoresistor: unknown property "${key}"`);
        }
      }
    });

    return () => {
      unregisterSensorUpdate(componentId);
    };
  },
});
