/**
 * Ky020TiltSwitch.ts — KY-020 tilt switch module.
 *
 * `tilted` is the whole state: true closes the contacts and drives S HIGH,
 * false opens them and drives S LOW. Click the element to flip it; the
 * sensor panel's "Toggle tilt" button sends `toggle`, and the test harness
 * sets `tilted` absolutely.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

PartSimulationRegistry.register('ky-020-tilt-switch', {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const pin = getArduinoPinHelper('S');
    if (pin === null) return () => {};

    const el = element as any;

    const applyTilt = (tilted: boolean) => {
      el.tilted = tilted;
      simulator.setPinState(pin, tilted);
      console.log(`[KY-020] pin ${pin} → ${tilted ? 'HIGH (tilted)' : 'LOW (upright)'}`);
    };

    applyTilt(el.tilted === true);

    const handleClick = () => applyTilt(!(el.tilted === true));
    element.addEventListener('click', handleClick);

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'tilted') {
          if (typeof value !== 'boolean') {
            throw new Error(`ky-020-tilt-switch: tilted must be a boolean, got ${value}`);
          }
          applyTilt(value);
        } else if (key === 'toggle') {
          if (value === true) applyTilt(!(el.tilted === true));
        } else {
          throw new Error(`ky-020-tilt-switch: unknown property "${key}"`);
        }
      }
    });

    return () => {
      element.removeEventListener('click', handleClick);
      unregisterSensorUpdate(componentId);
    };
  },
});
