/**
 * Ky008Laser.ts — KY-008 laser emitter module.
 *
 * Digital output observer: the signal pin's logic level is mirrored onto the
 * element's `laserOn` property, which shows or hides the beam in the SVG.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

PartSimulationRegistry.register('ky-008', {
  attachEvents: (element, _simulator, _getArduinoPinHelper, _componentId, getPinResolver) => {
    if (typeof getPinResolver !== 'function') {
      throw new Error('ky-008: attachEvents needs getPinResolver');
    }
    const signal = getPinResolver('signal');
    if (!signal) return () => {};

    const el = element as any;
    el.laserOn = signal.getCurrentState() === 'HIGH';
    return signal.onChange((state) => {
      el.laserOn = state === 'HIGH';
    });
  },
});
