// @vitest-environment jsdom
/**
 * PA1616S GPS part: the glue that registers embedgym_parts/pa1616s.py's module on its
 * TX pin with the wired pins and the GPS state, and forwards validated drives.
 * The module itself is tested in parts/test/py/ and, on the AVR, in
 * avr-local-parts.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import '../../sim/Pa1616s';

function makeElement(): HTMLElement {
  const el = document.createElement('div') as HTMLElement & Record<string, unknown>;
  el.fix = false;
  el.latitude = 37.7749;
  el.longitude = -122.4194;
  el.satellites = 8;
  el.altitude = 12.5;
  el.speed = 0;
  el.course = 0;
  return el;
}

const part = PartSimulationRegistry.get('pa1616s')!;

describe('pa1616s', () => {
  interface EspSim {
    registered: Array<{ type: string; pin: number; props: Record<string, unknown> }>;
    updates: Array<{ pin: number; props: Record<string, unknown> }>;
    unregistered: number[];
    registerSensor(type: string, pin: number, props: Record<string, unknown>): boolean;
    updateSensor(pin: number, props: Record<string, unknown>): void;
    unregisterSensor(pin: number): void;
  }

  function makeEspSim(): EspSim {
    return {
      registered: [],
      updates: [],
      unregistered: [],
      registerSensor(type, pin, props) {
        this.registered.push({ type, pin, props });
        return true;
      },
      updateSensor(pin, props) {
        this.updates.push({ pin, props });
      },
      unregisterSensor(pin) {
        this.unregistered.push(pin);
      },
    };
  }

  function attachEsp(sim: EspSim, el: HTMLElement, pins: Record<string, number | null>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return part.attachEvents!(el, sim as any, (name: string) => pins[name] ?? null, 'gps1');
  }

  it('registers the worker model on the TX gpio with the wired pins and state', () => {
    const sim = makeEspSim();
    const detach = attachEsp(sim, makeElement(), { TX: 4, RX: 5, FIX: 6 });
    expect(sim.registered).toEqual([
      {
        type: 'pa1616s',
        pin: 4,
        props: {
          fix: false,
          latitude: 37.7749,
          longitude: -122.4194,
          satellites: 8,
          altitude: 12.5,
          speed: 0,
          course: 0,
          rx_pin: 5,
          fix_pin: 6,
        },
      },
    ]);
    detach();
    expect(sim.unregistered).toEqual([4]);
  });

  it('forwards drives to the worker, with toggleFix resolved to the new fix', () => {
    const sim = makeEspSim();
    const el = makeElement();
    const detach = attachEsp(sim, el, { TX: 4 });
    dispatchSensorUpdate('gps1', { fix: true, latitude: 40.7128 });
    dispatchSensorUpdate('gps1', { toggleFix: true });
    expect(sim.updates).toEqual([
      { pin: 4, props: { fix: true, latitude: 40.7128 } },
      { pin: 4, props: { fix: false } },
    ]);
    expect((el as HTMLElement & Record<string, unknown>).latitude).toBe(40.7128);
    expect(() => dispatchSensorUpdate('gps1', { bogus: 1 })).toThrow(/unknown property/);
    detach();
  });

  it('throws when TX is not wired', () => {
    expect(() => attachEsp(makeEspSim(), makeElement(), { RX: 5 })).toThrow(/TX is not wired/);
  });
});
