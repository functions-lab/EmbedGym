import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

const NODES = ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'];

function keyPosition(e: Event): [number, number] {
  const { key, row, column } = (e as CustomEvent).detail;
  if (!Number.isInteger(row) || row < 0 || row > 3 || !Number.isInteger(column) || column < 0 || column > 3) {
    throw new Error(`membrane-keypad: key '${key}' has no position on a 4×4 matrix`);
  }
  return [row, column];
}

// Overrides BasicParts' membrane-keypad: the matrix is embedgym_parts/membrane_keypad.py,
// in the backend worker or, on the AVR, in Pyodide. It is registered on R1,
// with the other wired nodes by name.
PartSimulationRegistry.register('membrane-keypad', {
  attachEvents: (element, simulator, getPin) => {
    const sim = simulator as any;
    // An unwired node is null and one whose trace ends at GND -1: it still
    // conducts through the membrane, but no pin reads or drives it.
    const [r1, ...rest] = NODES.map((name) => {
      const pin = getPin(name);
      return pin === null || pin < 0 ? null : pin;
    });
    if (r1 === null) {
      const refuse = () => {
        if (simulator.isRunning()) throw new Error('membrane-keypad: R1 must be wired to a board pin');
      };
      element.addEventListener('button-press', refuse);
      return () => element.removeEventListener('button-press', refuse);
    }

    if (typeof sim.registerSensor !== 'function') return () => {};
    const fields: Record<string, unknown> = { keys: [] };
    rest.forEach((pin, i) => {
      if (pin !== null) fields[`${NODES[i + 1].toLowerCase()}_pin`] = pin;
    });
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('membrane-keypad', r1, fields) !== true) return () => {};

    const pressed = new Map<string, [number, number]>();
    const forward = () => sim.updateSensor(r1, { keys: [...pressed.values()] });
    const onPress = (e: Event) => {
      const [row, column] = keyPosition(e);
      pressed.set(`${row},${column}`, [row, column]);
      forward();
    };
    const onRelease = (e: Event) => {
      const [row, column] = keyPosition(e);
      pressed.delete(`${row},${column}`);
      forward();
    };
    element.addEventListener('button-press', onPress);
    element.addEventListener('button-release', onRelease);
    return () => {
      element.removeEventListener('button-press', onPress);
      element.removeEventListener('button-release', onRelease);
      sim.unregisterSensor(r1);
    };
  },
});
