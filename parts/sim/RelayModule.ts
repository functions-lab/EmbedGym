/**
 * RelayModule.ts — single-channel relay breakout module.
 *
 * Digital input observer: the IN pin's logic level is mirrored onto the
 * element's `energized` property, which throws the SPDT armature and lights
 * the status LED in the SVG. Contact pins (COM/NO/NC) carry no simulated
 * signal.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

PartSimulationRegistry.register('relay-module', {
  attachEvents: (element, _simulator, _getArduinoPinHelper, _componentId, getPinResolver) => {
    if (typeof getPinResolver !== 'function') {
      throw new Error('relay-module: attachEvents needs getPinResolver');
    }
    const input = getPinResolver('IN');
    if (!input) return () => {};

    const el = element as any;
    el.energized = input.getCurrentState() === 'HIGH';
    return input.onChange((state) => {
      el.energized = state === 'HIGH';
    });
  },
});
