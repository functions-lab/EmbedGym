/**
 * keypad-part.test.ts
 *
 * The membrane-keypad part models the switch matrix passively: a pressed key
 * shorts a row node to a column node, and whichever side the sketch happens to
 * be driving wins. These tests exercise the three scan idioms that all work on
 * real hardware — row-driven push-pull, column-driven (what `Keypad.h` does),
 * and high-impedance parking between strobes — plus the electrical corner
 * cases (conflicting drives, ghosting).
 *
 * The mock simulator holds a pin→mode table with a `setMode` helper that
 * notifies subscribers, standing in for AVRSimulator's DDR+PORT tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

import '@velxio/simulation/parts/BasicParts';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

// Matches the wiring in selftests/parts/wokwi-membrane-keypad*.
const ROWS = [30, 31, 32, 33];
const COLS = [34, 35, 36, 37];
const KEYPAD_PINS = {
  R1: 30, R2: 31, R3: 32, R4: 33,
  C1: 34, C2: 35, C3: 36, C4: 37,
};

const KEYS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
];

type PinMode = 'output-low' | 'output-high' | 'input' | 'input-pullup';

function makeElement() {
  const handlers = new Map<string, ((e: Event) => void)[]>();
  const element = {
    addEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), cb]);
    }),
    removeEventListener: vi.fn((type: string, cb: (e: Event) => void) => {
      handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== cb));
    }),
  } as unknown as HTMLElement;

  const press = (key: string, detail?: { row: number; column: number }) => {
    const row = KEYS.findIndex((r) => r.includes(key));
    const position = detail ?? { row, column: KEYS[row].indexOf(key) };
    for (const cb of handlers.get('button-press') ?? []) {
      cb(new CustomEvent('button-press', { detail: { key, ...position } }));
    }
  };
  const release = (key: string) => {
    const row = KEYS.findIndex((r) => r.includes(key));
    for (const cb of handlers.get('button-release') ?? []) {
      cb(new CustomEvent('button-release', {
        detail: { key, row, column: KEYS[row].indexOf(key) },
      }));
    }
  };
  return { element, press, release };
}

function makeSimulator(
  opts: { pinModeApi?: boolean; running?: boolean; backendMatrix?: boolean } = {},
) {
  const { pinModeApi = true, running = true, backendMatrix = false } = opts;
  const modes = new Map<number, PinMode>();
  const subscribers = new Map<number, Set<(mode: PinMode) => void>>();

  const pinManager = {
    onPinChange: vi.fn().mockReturnValue(() => {}),
    onPwmChange: vi.fn().mockReturnValue(() => {}),
    triggerPinChange: vi.fn(),
  };

  const sim: Record<string, unknown> = {
    pinManager,
    setPinState: vi.fn(),
    isRunning: () => running,
    cpu: { data: new Uint8Array(512).fill(0), cycles: 0 },
  };

  if (backendMatrix) {
    sim.registerSensor = vi.fn().mockReturnValue(true);
    sim.updateSensor = vi.fn();
    sim.unregisterSensor = vi.fn();
  }

  if (pinModeApi) {
    sim.getPinMode = (pin: number): PinMode => modes.get(pin) ?? 'input';
    sim.onPinModeChange = (pin: number, cb: (mode: PinMode) => void) => {
      const set = subscribers.get(pin) ?? new Set();
      subscribers.set(pin, set);
      set.add(cb);
      return () => set.delete(cb);
    };
  }

  /** Set one or more pins' modes, notifying subscribers as the simulator does. */
  const setMode = (pins: number | number[], mode: PinMode) => {
    for (const pin of Array.isArray(pins) ? pins : [pins]) {
      if (modes.get(pin) === mode) continue;
      modes.set(pin, mode);
      for (const cb of subscribers.get(pin) ?? []) cb(mode);
    }
  };

  /** Last level the part drove onto `pin`, or undefined if it never did. */
  const driven = (pin: number): boolean | undefined => {
    const calls = (sim.setPinState as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([p]) => p === pin,
    );
    return calls.length ? (calls[calls.length - 1][1] as boolean) : undefined;
  };

  return { sim, setMode, driven, subscriberCount: () => [...subscribers.values()].reduce((n, s) => n + s.size, 0) };
}

function attach(opts: Parameters<typeof makeSimulator>[0] = {}, pins = KEYPAD_PINS) {
  const logic = PartSimulationRegistry.get('membrane-keypad')!;
  const el = makeElement();
  const mock = makeSimulator(opts);
  const cleanup = logic.attachEvents!(
    el.element,
    mock.sim as never,
    (name: string) => (name in pins ? (pins as Record<string, number>)[name] : null),
    'KP1',
  );
  return { ...el, ...mock, cleanup };
}

describe('membrane-keypad — idle', () => {
  it('seeds every input pin HIGH at attach and never uses onPinChange', () => {
    const kp = attach();
    for (const pin of [...ROWS, ...COLS]) expect(kp.driven(pin)).toBe(true);
    // PORT-diff notifications are blind to high-impedance parking, so the part
    // must not depend on them at all.
    expect((kp.sim.pinManager as { onPinChange: ReturnType<typeof vi.fn> }).onPinChange)
      .not.toHaveBeenCalled();
  });

  it('leaves columns HIGH when a row is strobed with no key pressed', () => {
    const kp = attach();
    kp.setMode(COLS, 'input-pullup');
    kp.setMode(ROWS[0], 'output-low');
    for (const pin of COLS) expect(kp.driven(pin)).toBe(true);
  });
});

describe('membrane-keypad — row-driven scan', () => {
  it('pulls the pressed key\'s column LOW while its row is driven LOW', () => {
    const kp = attach();
    kp.setMode(ROWS, 'output-high');
    kp.setMode(COLS, 'input-pullup');
    kp.press('5'); // row 1, column 1

    kp.setMode(ROWS[1], 'output-low');
    expect(kp.driven(COLS[1])).toBe(false);
    // Other columns are untouched by this key.
    expect(kp.driven(COLS[0])).toBe(true);
  });

  it('releases the column when the row returns HIGH', () => {
    const kp = attach();
    kp.setMode(ROWS, 'output-high');
    kp.setMode(COLS, 'input-pullup');
    kp.press('5');
    kp.setMode(ROWS[1], 'output-low');
    kp.setMode(ROWS[1], 'output-high');
    expect(kp.driven(COLS[1])).toBe(true);
  });

  it('releases the column when the key is released mid-strobe', () => {
    const kp = attach();
    kp.setMode(ROWS, 'output-high');
    kp.setMode(COLS, 'input-pullup');
    kp.press('5');
    kp.setMode(ROWS[1], 'output-low');
    expect(kp.driven(COLS[1])).toBe(false);

    kp.release('5');
    expect(kp.driven(COLS[1])).toBe(true);
  });

  it('ignores a strobe of a row the pressed key is not on', () => {
    const kp = attach();
    kp.setMode(ROWS, 'output-high');
    kp.setMode(COLS, 'input-pullup');
    kp.press('5'); // row 1
    kp.setMode(ROWS[2], 'output-low');
    expect(kp.driven(COLS[1])).toBe(true);
  });
});

describe('membrane-keypad — column-driven scan (Keypad.h)', () => {
  // Keypad.h holds the rows at INPUT_PULLUP and strobes one column at a time.
  it('pulls the pressed key\'s row LOW while its column is driven LOW', () => {
    const kp = attach();
    kp.setMode(ROWS, 'input-pullup');
    kp.press('5'); // row 1, column 1

    kp.setMode(COLS[1], 'output-low');
    expect(kp.driven(ROWS[1])).toBe(false);
    expect(kp.driven(ROWS[0])).toBe(true);

    kp.setMode(COLS[1], 'input'); // parked back at high-Z
    expect(kp.driven(ROWS[1])).toBe(true);
  });

  it('never writes a pin while the sketch is driving it', () => {
    const kp = attach();
    kp.setMode(ROWS, 'input-pullup');
    kp.press('5');
    (kp.sim.setPinState as ReturnType<typeof vi.fn>).mockClear();

    kp.setMode(COLS[1], 'output-low');
    kp.press('1'); // another key on the same column, forcing a recompute

    const wroteToDrivenColumn = (kp.sim.setPinState as ReturnType<typeof vi.fn>).mock.calls.some(
      ([pin]) => pin === COLS[1],
    );
    expect(wroteToDrivenColumn).toBe(false);
  });

  it('reports no key when the column strobed is not the pressed one', () => {
    const kp = attach();
    kp.setMode(ROWS, 'input-pullup');
    kp.press('5'); // column 1
    kp.setMode(COLS[0], 'output-low');
    for (const pin of ROWS) expect(kp.driven(pin)).toBe(true);
  });
});

describe('membrane-keypad — high-impedance parking', () => {
  // The regression the old model got wrong: it treated a row's last PORT level
  // as its drive state, so a row parked at INPUT stayed stale-"active" and keys
  // decoded against the wrong row.
  it('a row parked at high-Z stops pulling its column LOW', () => {
    const kp = attach();
    kp.setMode(COLS, 'input-pullup');
    kp.press('5'); // row 1, column 1

    kp.setMode(ROWS[1], 'output-low');
    expect(kp.driven(COLS[1])).toBe(false);

    kp.setMode(ROWS[1], 'input'); // pinMode(row, INPUT) — DDR-only change
    expect(kp.driven(COLS[1])).toBe(true);
  });

  it('scans the whole matrix correctly with only one row driven at a time', () => {
    const kp = attach();
    kp.setMode(COLS, 'input-pullup');
    kp.press('*'); // row 3, column 0

    const seen: string[] = [];
    for (let row = 0; row < 4; row++) {
      kp.setMode(ROWS[row], 'output-low');
      for (let col = 0; col < 4; col++) {
        if (kp.driven(COLS[col]) === false) seen.push(KEYS[row][col]);
      }
      kp.setMode(ROWS[row], 'input');
    }
    expect(seen).toEqual(['*']);
  });
});

describe('membrane-keypad — electrical corner cases', () => {
  it('LOW wins a conflict and warns once per shorted group', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kp = attach();
    kp.setMode(ROWS[1], 'output-high');
    kp.setMode(COLS[1], 'output-low');
    kp.press('5'); // shorts a HIGH driver to a LOW driver

    expect(warn).toHaveBeenCalledTimes(1);
    // Re-pressing the same key re-enters the same conflict; only one warning.
    kp.release('5');
    kp.press('5');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('ghosts a fourth key when three pressed keys bridge its row and column', () => {
    const kp = attach();
    kp.setMode(COLS, 'input-pullup');
    // '1'(0,0), '2'(0,1), '4'(1,0) bridge row 1 to column 1 → phantom '5'.
    kp.press('1');
    kp.press('2');
    kp.press('4');

    kp.setMode(ROWS[1], 'output-low');
    expect(kp.driven(COLS[1])).toBe(false); // the phantom key
  });
});

describe('membrane-keypad — wiring', () => {
  it('ignores unwired pins and GND-trace pins, still scanning the rest', () => {
    // C4 unwired (null); R4's trace resolves to GND (-1).
    const kp = attach({}, { R1: 30, R2: 31, R3: 32, R4: -1, C1: 34, C2: 35, C3: 36 });
    expect(kp.driven(37)).toBeUndefined();

    kp.setMode([34, 35, 36], 'input-pullup');
    kp.press('5');
    kp.setMode(31, 'output-low');
    expect(kp.driven(35)).toBe(false);
  });

  it('subscribes only to wired pins', () => {
    const kp = attach({}, { R1: 30, C1: 34 });
    expect(kp.subscriberCount()).toBe(2);
  });
});

describe('membrane-keypad — errors', () => {
  it('raises on a key with no position on the matrix', () => {
    const kp = attach();
    // What the element emits for a key it cannot find: keyIndex() → {-1, -1}.
    expect(() => kp.press('?', { row: -1, column: -1 })).toThrow(/no position/);
  });

  it('raises on interaction when the board has no pin-direction API', () => {
    const kp = attach({ pinModeApi: false });
    expect(() => kp.press('5')).toThrow(/pin-direction API/);
  });

  it('stays silent on a board with no pin-direction API while not running', () => {
    const kp = attach({ pinModeApi: false, running: false });
    expect(() => kp.press('5')).not.toThrow();
    expect(kp.sim.setPinState).not.toHaveBeenCalled();
  });
});

describe('membrane-keypad — backend-resolved matrix', () => {
  const NRF_PINS = { R1: 40, R2: 33, R3: 34, R4: 27, C1: 21, C2: 23, C3: 46, C4: 45 };
  const attachBackend = (pins: Record<string, number> = NRF_PINS) =>
    attach({ pinModeApi: false, backendMatrix: true }, pins as typeof KEYPAD_PINS);

  it('keys the worker model on R1 with the other nodes by name, and drives no pin itself', () => {
    const kp = attachBackend();
    expect(kp.sim.registerSensor).toHaveBeenCalledWith('membrane-keypad', 40, {
      r2_pin: 33, r3_pin: 34, r4_pin: 27, c1_pin: 21, c2_pin: 23, c3_pin: 46, c4_pin: 45,
      keys: [],
    });
    kp.press('5');
    expect(kp.sim.setPinState).not.toHaveBeenCalled();
  });

  it('reports the whole pressed set on every press and release', () => {
    const kp = attachBackend();
    kp.press('5');
    expect(kp.sim.updateSensor).toHaveBeenLastCalledWith(40, { keys: [[1, 1]] });
    kp.press('D');
    expect(kp.sim.updateSensor).toHaveBeenLastCalledWith(40, { keys: [[1, 1], [3, 3]] });
    kp.release('5');
    expect(kp.sim.updateSensor).toHaveBeenLastCalledWith(40, { keys: [[3, 3]] });
  });

  it('leaves unwired and GND-trace nodes out of the attach', () => {
    const kp = attachBackend({ R1: 40, R2: 33, R4: -1, C2: 23 });
    expect(kp.sim.registerSensor).toHaveBeenCalledWith('membrane-keypad', 40, {
      r2_pin: 33, c2_pin: 23, keys: [],
    });
  });

  it('does not hand the matrix to the worker when R1 is unwired', () => {
    const kp = attachBackend({ R2: 33, C2: 23 });
    expect(kp.sim.registerSensor).not.toHaveBeenCalled();
  });

  it('raises on a key with no position on the matrix', () => {
    const kp = attachBackend();
    expect(() => kp.press('?', { row: -1, column: -1 })).toThrow(/no position/);
  });

  it('detaches from the worker and drops both listeners on cleanup', () => {
    const kp = attachBackend();
    kp.cleanup();
    expect(kp.sim.unregisterSensor).toHaveBeenCalledWith(40);
    kp.press('5');
    expect(kp.sim.updateSensor).not.toHaveBeenCalled();
  });
});

describe('membrane-keypad — cleanup', () => {
  it('unsubscribes every pin and both element listeners', () => {
    const kp = attach();
    kp.cleanup();
    expect(kp.subscriberCount()).toBe(0);
    expect(kp.element.removeEventListener).toHaveBeenCalledWith('button-press', expect.any(Function));
    expect(kp.element.removeEventListener).toHaveBeenCalledWith('button-release', expect.any(Function));
  });

  it('drives no pins after cleanup', () => {
    const kp = attach();
    kp.setMode(COLS, 'input-pullup');
    kp.cleanup();
    (kp.sim.setPinState as ReturnType<typeof vi.fn>).mockClear();
    kp.setMode(ROWS[1], 'output-low');
    expect(kp.sim.setPinState).not.toHaveBeenCalled();
  });
});
