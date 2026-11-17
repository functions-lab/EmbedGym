import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

type StateSink = (values: Record<string, unknown>) => void;

interface Drv2605lSimulator {
  registerSensor?(type: string, pin: number, properties: Record<string, unknown>): boolean;
  unregisterSensor(pin: number): void;
  onPartState?(pin: number, apply: StateSink): () => void;
  getBridge?(): { onPartState(pin: number, apply: StateSink): () => void };
}

const REPORTED = new Set(['standby', 'mode', 'library', 'go', 'drive', 'vibrating', 'effectCount', 'lastEffect',
  'lastEffectMs', 'effects']);

PartSimulationRegistry.register('drv2605l', {
  attachEvents: (element, simulator) => {
    const sim = simulator as unknown as Drv2605lSimulator;
    if (typeof sim.registerSensor !== 'function') return () => {};
    const el = element as unknown as Record<string, unknown>;
    // Registers, sequencer and RTP are embedgym_parts/i2c/drv2605l.py's DRV2605LSlave,
    // in the backend worker or, on the AVR, in Pyodide; it reports the
    // element's observables.
    const virtualPin = 200 + 0x5a;
    const apply: StateSink = (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (!REPORTED.has(key)) throw new Error(`drv2605l: the model reported unknown state ${key}`);
        el[key] = value;
      }
    };
    const bridge = typeof sim.getBridge === 'function' ? sim.getBridge() : null;
    const release = bridge ? bridge.onPartState(virtualPin, apply) : sim.onPartState!(virtualPin, apply);
    let native: boolean;
    try {
      native = sim.registerSensor('drv2605l', virtualPin, { addr: 0x5a }) === true;
    } catch (error) { release(); throw error; }
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (!native) { release(); return () => {}; }
    return () => {
      sim.unregisterSensor(virtualPin);
      release();
    };
  },
});
