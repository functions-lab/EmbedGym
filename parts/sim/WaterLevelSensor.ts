/**
 * WaterLevelSensor.ts — analog water level sensor module.
 *
 * The exposed traces form a divider whose output rises with the immersed
 * depth. `level` (0 = dry, 1023 = fully immersed) maps linearly onto the
 * signal pin as 0 V … VCC. The level reaches the ADC through the SPICE divider
 * in `spice/ratiometricSensors.ts`.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { idleValue } from '@velxio/simulation/spice/ratiometricSensors';

PartSimulationRegistry.register('water-level-sensor', {
  attachEvents: (element, _simulator, _getArduinoPinHelper, componentId) => {
    const el = element as any;

    const applyLevel = (value: unknown) => {
      if (typeof value !== 'number' || value < 0 || value > 1023) {
        throw new Error(`water-level-sensor: level must be 0–1023, got ${value}`);
      }
      el.level = value;
      emitPropertyChange(componentId, 'level', value);
    };

    applyLevel(typeof el.level === 'number' ? el.level : idleValue('water-level-sensor', 'level'));

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'level') {
          applyLevel(value);
        } else {
          throw new Error(`water-level-sensor: unknown property "${key}"`);
        }
      }
    });

    return () => {
      unregisterSensorUpdate(componentId);
    };
  },
});
