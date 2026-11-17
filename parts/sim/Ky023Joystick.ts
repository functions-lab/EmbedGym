/**
 * Ky023Joystick.ts — KY-023 2-axis joystick module.
 *
 * `x` / `y` (0–1023) map linearly onto VRx / VRy as 0 V … VCC, idle 512 =
 * VCC/2; the levels reach the ADC through the SPICE dividers in
 * `spice/ratiometricSensors.ts`. `pressed` drives SW active-low (idle HIGH);
 * the sensor panel's "Toggle button" sends `toggle`, and the test harness sets
 * `pressed` absolutely.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { idleValue } from '@velxio/simulation/spice/ratiometricSensors';

PartSimulationRegistry.register('joystick', {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const pinSW = getArduinoPinHelper('SW');
    const el = element as any;

    const applyAxis = (axis: 'x' | 'y', value: unknown) => {
      if (typeof value !== 'number' || value < 0 || value > 1023) {
        throw new Error(`joystick: ${axis} must be 0–1023, got ${value}`);
      }
      el[axis] = value;
      emitPropertyChange(componentId, axis, value);
    };

    const applyPressed = (pressed: unknown) => {
      if (typeof pressed !== 'boolean') {
        throw new Error(`joystick: pressed must be a boolean, got ${pressed}`);
      }
      el.pressed = pressed;
      if (pinSW !== null) simulator.setPinState(pinSW, !pressed);
      emitPropertyChange(componentId, 'pressed', pressed);
    };

    applyAxis('x', typeof el.x === 'number' ? el.x : idleValue('joystick', 'x'));
    applyAxis('y', typeof el.y === 'number' ? el.y : idleValue('joystick', 'y'));
    applyPressed(el.pressed === true);

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'x') {
          applyAxis('x', value);
        } else if (key === 'y') {
          applyAxis('y', value);
        } else if (key === 'pressed') {
          applyPressed(value);
        } else if (key === 'toggle') {
          if (value === true) applyPressed(!(el.pressed === true));
        } else {
          throw new Error(`joystick: unknown property "${key}"`);
        }
      }
    });

    return () => {
      unregisterSensorUpdate(componentId);
    };
  },
});
