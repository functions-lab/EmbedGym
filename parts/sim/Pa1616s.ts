/**
 * Pa1616s.ts — PA1616S GPS module (MTK3339 chipset, Adafruit Ultimate GPS v3).
 *
 * The module is embedgym_parts/pa1616s.py's PA1616SModule, in the backend worker or,
 * on the AVR, in Pyodide; it is registered on its TX pin with the wired RX,
 * FIX and PPS pins. This side validates and supplies the GPS state (fix /
 * latitude / longitude / satellites / altitude / speed / course), which the
 * sensor control panel or the test harness drives.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

interface GpsState {
  fix: boolean;
  latitude: number;
  longitude: number;
  satellites: number;
  altitude: number;
  speed: number;
  course: number;
}

/** The velxio element declares the GPS state with defaults; a foreign element
 *  here means the circuit references the wrong part. */
function requireGpsState(element: Element): HTMLElement & GpsState {
  const el = element as HTMLElement & GpsState;
  if (typeof el.fix !== 'boolean' || typeof el.latitude !== 'number') {
    throw new Error('pa1616s: element does not carry GPS state (wrong element for metadataId)');
  }
  return el;
}

/** Sensor control panel / test harness drive: apply to the element and return
 *  the resulting state fields (`toggleFix` becomes the new `fix`). */
function applyValues(el: HTMLElement & GpsState, values: Record<string, unknown>) {
  const applied: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === 'fix') {
      el.fix = Boolean(value);
      applied.fix = el.fix;
    } else if (key === 'toggleFix') {
      if (value === true) el.fix = !el.fix;
      applied.fix = el.fix;
    } else if (key === 'latitude' || key === 'longitude' || key === 'satellites' ||
               key === 'altitude' || key === 'speed' || key === 'course') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`pa1616s: ${key} must be a finite number, got ${value}`);
      }
      el[key] = value;
      applied[key] = value;
    } else {
      throw new Error(`pa1616s: unknown property "${key}"`);
    }
  }
  return applied;
}

PartSimulationRegistry.register('pa1616s', {
  attachEvents: (element, simulator, getPin, componentId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simulator as any;
    if (typeof sim.registerSensor !== 'function') return () => {};
    const txPin = getPin('TX');
    if (txPin === null) throw new Error('pa1616s: TX is not wired to a board pin');
    const el = requireGpsState(element);
    const props: Record<string, unknown> = {
      fix: el.fix,
      latitude: el.latitude,
      longitude: el.longitude,
      satellites: el.satellites,
      altitude: el.altitude,
      speed: el.speed,
      course: el.course,
    };
    for (const [key, name] of [['rx_pin', 'RX'], ['fix_pin', 'FIX'], ['pps_pin', 'PPS']] as const) {
      const pin = getPin(name);
      if (pin !== null) props[key] = pin;
    }
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('pa1616s', txPin, props) !== true) return () => {};
    registerSensorUpdate(componentId, (values) => {
      sim.updateSensor(txPin, applyValues(el, values));
    });
    return () => {
      sim.unregisterSensor(txPin);
      unregisterSensorUpdate(componentId);
    };
  },
});
