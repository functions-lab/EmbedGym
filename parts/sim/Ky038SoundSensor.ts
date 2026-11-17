/**
 * Ky038SoundSensor.ts — KY-038 microphone sound sensor module.
 *
 * `soundLevel` (0–1023) maps linearly onto A0 as 0 V … VCC; the level reaches
 * the ADC through the SPICE divider in `spice/ratiometricSensors.ts`. The
 * on-board comparator output D0 is HIGH while soundLevel is above `threshold`
 * (0–1023, default 512 — the trim pot setting). It chatters as it turns HIGH:
 * D0 rises, falls 12 ms later and rises again at 24 ms, driven on the board's
 * clock; it falls cleanly. A comparator change during the chatter (a sound
 * event under 24 ms) raises. `detected` is the comparator state, which D0
 * settles to.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { drivePinAfter, emitPropertyChange, simNowS } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { idleValue } from '@velxio/simulation/spice/ratiometricSensors';

// D0 after it first rises: LOW, then HIGH to stay.
const CHATTER_S = [12e-3, 24e-3];

PartSimulationRegistry.register('ky-038-sound-sensor', {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const pinD0 = getArduinoPinHelper('D0');
    const el = element as any;

    const checkCounts = (prop: 'soundLevel' | 'threshold', value: unknown): number => {
      if (typeof value !== 'number' || value < 0 || value > 1023) {
        throw new Error(`ky-038-sound-sensor: ${prop} must be 0–1023, got ${value}`);
      }
      return value;
    };

    let soundLevel = checkCounts(
      'soundLevel',
      typeof el.soundLevel === 'number' ? el.soundLevel : idleValue('ky-038-sound-sensor', 'soundLevel'),
    );
    let threshold = checkCounts('threshold', typeof el.threshold === 'number' ? el.threshold : 512);

    // On the board's clock, which restarts from zero with the MCU.
    let chatterEndS = -Infinity;
    const unsubscribeReset = simulator.pinManager.onHardReset(() => {
      chatterEndS = -Infinity;
    });

    const apply = (initial: boolean) => {
      el.soundLevel = soundLevel;
      el.threshold = threshold;
      const detected = soundLevel > threshold;
      if (pinD0 !== null && (initial || detected !== el.detected)) {
        if (!initial) {
          const now = simNowS(simulator);
          if (now < chatterEndS) {
            throw new Error('ky-038-sound-sensor: the comparator changed while D0 was still chattering');
          }
          if (detected) chatterEndS = now + CHATTER_S[CHATTER_S.length - 1];
        }
        simulator.setPinState(pinD0, detected);
        if (!initial && detected) {
          CHATTER_S.forEach((t, i) => drivePinAfter(simulator, pinD0, i % 2 === 1, t));
        }
      }
      el.detected = detected;
    };

    apply(true);

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'soundLevel') {
          soundLevel = checkCounts('soundLevel', value);
        } else if (key === 'threshold') {
          threshold = checkCounts('threshold', value);
        } else {
          throw new Error(`ky-038-sound-sensor: unknown property "${key}"`);
        }
        emitPropertyChange(componentId, key, value);
      }
      apply(false);
    });

    return () => {
      unsubscribeReset();
      unregisterSensorUpdate(componentId);
    };
  },
});
