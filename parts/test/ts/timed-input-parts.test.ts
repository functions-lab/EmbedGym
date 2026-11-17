/**
 * Parts whose input edges follow a timed pattern: bounce-button contact
 * bounce around the solved level, KY-038 D0 chatter. Checks the pattern each
 * part asks the board to drive, on the CPU cycle clock (AVR) and on the
 * bridge shim's virtual ns (ESP32 / nRF).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { useElectricalStore } from '@velxio/store/useElectricalStore';
import { useSimulatorStore, getBoardPinManager } from '@velxio/store/useSimulatorStore';
import '../../sim/BounceButton';
import '../../sim/Ky038SoundSensor';

const HZ = 16_000_000;

// The default store board; mcuPinNet finds a part's board by its PinManager.
const BOARD = useSimulatorStore.getState().boards[0].id;
const boardPm = () => getBoardPinManager(BOARD)!;

function avrSim() {
  let cycles = 1_000;
  return {
    spiceDrivenInputs: true,
    pinManager: boardPm(),
    setPinState: vi.fn(),
    schedulePinChange: vi.fn(),
    getCurrentCycles: () => cycles,
    getClockHz: () => HZ,
    advanceMs: (ms: number) => {
      cycles += ms * (HZ / 1000);
    },
  };
}

function bridgeSim() {
  return {
    spiceDrivenInputs: true,
    pinManager: boardPm(),
    setPinState: vi.fn(),
    sendPinEventAfter: vi.fn(),
    getCurrentCycles: () => -1,
    getClockHz: () => 240_000_000,
    getVirtualTimeNs: () => 5_000_000,
  };
}

// A fresh solve of the button in state `pressed`: the MCU pin 2's net at
// `mcuVolts`, the button leg's at `legVolts` (the same net unless a series
// resistor splits them).
function solve(mcuVolts: number, pressed: boolean, legVolts = mcuVolts, fanOut = false) {
  const split = legVolts !== mcuVolts;
  useElectricalStore.setState({
    nodeVoltages: split ? { n_mcu: mcuVolts, n_leg: legVolts } : { n_mcu: mcuVolts },
    pinNetMap: new Map([
      [`${BOARD}:2`, 'n_mcu'],
      ...(fanOut ? [[`${BOARD}:3`, 'n_mcu'] as [string, string]] : []),
      ['BTN:1.l', split ? 'n_leg' : 'n_mcu'],
    ]),
    sourcedNets: new Set(['n_mcu', 'n_leg']),
    solvedComponents: [{ id: 'BTN', properties: { pressed } }],
  });
}

// A stand-in element whose listeners are called directly, so a part that
// raises raises here instead of being reported by dispatchEvent.
function attachButton(sim: object) {
  const listeners = new Map<string, () => void>();
  const el = {
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: () => {},
  } as unknown as HTMLElement;
  PartSimulationRegistry.get('bounce-button')!.attachEvents!(el, sim as any, (p) => (p === '1.l' ? 2 : null), 'BTN');
  return (event: 'button-press' | 'button-release') => listeners.get(event)!();
}

const cyclesAt = (ms: number) => 1_000 + ms * (HZ / 1000);

describe('bounce-button', () => {
  beforeEach(() => solve(0, false));

  it('bounces a press between the solved open and closed levels', () => {
    const sim = avrSim();
    const actuate = attachButton(sim);
    actuate('button-press');
    solve(5, true);
    expect(sim.schedulePinChange.mock.calls).toEqual([
      [2, false, cyclesAt(1.5)],
      [2, true, cyclesAt(3)],
      [2, false, cyclesAt(4)],
      [2, true, cyclesAt(4.8)],
    ]);
    sim.schedulePinChange.mockClear();
    sim.advanceMs(100);
    actuate('button-release');
    solve(0, false);
    expect(sim.schedulePinChange.mock.calls.map(([, level]) => level)).toEqual([true, false, true, false]);
  });

  it('lands a bridge bounce in virtual ns', () => {
    const sim = bridgeSim();
    const actuate = attachButton(sim);
    actuate('button-press');
    solve(3.3, true);
    expect(sim.sendPinEventAfter.mock.calls).toEqual([
      [2, false, 1_500_000],
      [2, true, 3_000_000],
      [2, false, 4_000_000],
      [2, true, 4_800_000],
    ]);
  });

  it('bounces only an actuation that changes the MCU pin level', () => {
    const sim = avrSim();
    const actuate = attachButton(sim);
    solve(5, false); // a level change with no actuation
    actuate('button-press');
    solve(5, true); // an actuation that leaves the level where it was
    solve(0, true); // a later change is not that actuation's
    expect(sim.schedulePinChange).not.toHaveBeenCalled();
  });

  it('waits past a solve that was under way when the button moved', () => {
    const sim = avrSim();
    const actuate = attachButton(sim);
    actuate('button-press');
    solve(0, false);
    expect(sim.schedulePinChange).not.toHaveBeenCalled();
    solve(5, true);
    expect(sim.schedulePinChange).toHaveBeenCalledTimes(4);
  });

  it('reads the MCU side of a series resistor, not the button leg', () => {
    const sim = avrSim();
    const actuate = attachButton(sim);
    actuate('button-press');
    solve(0.45, true, 5);
    expect(sim.schedulePinChange).not.toHaveBeenCalled();
  });

  it('bounces every MCU input on the signal net', () => {
    const sim = avrSim();
    const actuate = attachButton(sim);
    solve(0, false, 0, true);
    actuate('button-press');
    solve(5, true, 5, true);
    const pins = sim.schedulePinChange.mock.calls.map(([pin]) => pin);
    expect(pins).toEqual([2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('does not bounce a pin the MCU drives as an output', () => {
    const sim = avrSim();
    const outputs = vi.spyOn(boardPm(), 'getOutputPins').mockReturnValue(new Set([2]));
    const actuate = attachButton(sim);
    actuate('button-press');
    solve(5, true);
    outputs.mockRestore();
    expect(sim.schedulePinChange).not.toHaveBeenCalled();
  });
});

describe('ky-038-sound-sensor D0', () => {
  function attachMic(sim: object) {
    const el = {} as HTMLElement;
    PartSimulationRegistry.get('ky-038-sound-sensor')!.attachEvents!(
      el,
      sim as any,
      (p) => (p === 'D0' ? 7 : null),
      'MIC',
    );
    return el as unknown as { detected: boolean };
  }

  it('chatters as it rises and falls cleanly', () => {
    const sim = avrSim();
    const el = attachMic(sim);
    expect(sim.setPinState.mock.calls).toEqual([[7, false]]);
    dispatchSensorUpdate('MIC', { soundLevel: 900 });
    expect(sim.setPinState).toHaveBeenLastCalledWith(7, true);
    expect(sim.schedulePinChange.mock.calls).toEqual([
      [7, false, cyclesAt(12)],
      [7, true, cyclesAt(24)],
    ]);
    expect(el.detected).toBe(true);
    sim.advanceMs(100);
    dispatchSensorUpdate('MIC', { soundLevel: 0 });
    expect(sim.setPinState).toHaveBeenLastCalledWith(7, false);
    expect(sim.schedulePinChange).toHaveBeenCalledTimes(2);
  });

  it('chatters when the threshold drops below the level', () => {
    const sim = bridgeSim();
    attachMic(sim);
    dispatchSensorUpdate('MIC', { soundLevel: 600, threshold: 950 });
    expect(sim.sendPinEventAfter).not.toHaveBeenCalled();
    dispatchSensorUpdate('MIC', { threshold: 512 });
    expect(sim.sendPinEventAfter.mock.calls).toEqual([
      [7, false, 12_000_000],
      [7, true, 24_000_000],
    ]);
  });

  it('raises on a comparator change during the chatter, until the MCU restarts', () => {
    const sim = avrSim();
    attachMic(sim);
    dispatchSensorUpdate('MIC', { soundLevel: 900 });
    sim.advanceMs(10);
    expect(() => dispatchSensorUpdate('MIC', { soundLevel: 0 })).toThrow(/still chattering/);
    boardPm().hardResetPinStates();
    expect(() => dispatchSensorUpdate('MIC', { soundLevel: 0 })).not.toThrow();
  });
});
