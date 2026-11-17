/**
 * Sen0244.ts — DFRobot Gravity analog TDS sensor (SEN0244).
 *
 * `tds` (ppm at 25 °C, 0–1000; 0 = probe out of water) reaches the ADC as the
 * signal-pin voltage solved in `spice/tdsSensor.ts`.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { TDS_MAX_PPM } from '@velxio/simulation/spice/tdsSensor';

PartSimulationRegistry.register('sen0244', {
  attachEvents: (element, _simulator, _getArduinoPinHelper, componentId) => {
    const el = element as any;

    const applyTds = (value: unknown) => {
      if (typeof value !== 'number' || value < 0 || value > TDS_MAX_PPM) {
        throw new Error(`sen0244: tds must be 0–${TDS_MAX_PPM} ppm, got ${value}`);
      }
      el.tds = value;
      emitPropertyChange(componentId, 'tds', value);
    };

    applyTds(typeof el.tds === 'number' ? el.tds : 0);

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'tds') {
          applyTds(value);
        } else {
          throw new Error(`sen0244: unknown property "${key}"`);
        }
      }
    });

    return () => {
      unregisterSensorUpdate(componentId);
    };
  },
});
