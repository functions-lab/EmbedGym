/**
 * ActiveBuzzer.ts — sealed active buzzer (built-in oscillator).
 *
 * Level observer: it sounds while pin 1 is HIGH, whatever the drive waveform,
 * unlike the passive `buzzer`, which needs a tone() waveform. The pin level is
 * mirrored onto the element's `sounding` property.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

PartSimulationRegistry.register('active-buzzer', {
  attachEvents: (element, _simulator, _getArduinoPinHelper, _componentId, getPinResolver) => {
    if (typeof getPinResolver !== 'function') {
      throw new Error('active-buzzer: attachEvents needs getPinResolver');
    }
    const signal = getPinResolver('1');
    if (!signal) return () => {};

    const el = element as any;
    el.sounding = signal.getCurrentState() === 'HIGH';
    return signal.onChange((state) => {
      el.sounding = state === 'HIGH';
    });
  },
});
