import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

// Overrides BasicParts' ky-040: the encoder is embedgym_parts/ky040.py's KY040 through
// embedgym_parts/registry.py, in the backend worker or, on the AVR, in Pyodide. It
// registers on CLK; an unwired DT or SW is left out, and the model rejects a
// missing DT.
PartSimulationRegistry.register('ky-040', {
  attachEvents: (element, simulator, getPin) => {
    const sim = simulator as any;
    const clk = getPin('CLK');
    if (clk === null || typeof sim.registerSensor !== 'function') return () => {};
    const dt = getPin('DT');
    const sw = getPin('SW');
    const pins = { ...(dt === null ? {} : { dt_pin: dt }), ...(sw === null ? {} : { sw_pin: sw }) };
    // The button held now: a reset re-attaches the encoder with it.
    let pressed = false;
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (sim.registerSensor('ky-040', clk, { ...pins, pressed }, undefined, () => ({ ...pins, pressed })) !== true) {
      return () => {};
    }
    const press = (held: boolean) => {
      pressed = held;
      sim.updateSensor(clk, { pressed });
    };
    const handlers: Record<string, () => void> = {
      'rotate-cw': () => sim.updateSensor(clk, { step: 'cw' }),
      'rotate-ccw': () => sim.updateSensor(clk, { step: 'ccw' }),
      'button-press': () => press(true),
      'button-release': () => press(false),
    };
    for (const [event, handler] of Object.entries(handlers)) element.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) element.removeEventListener(event, handler);
      sim.unregisterSensor(clk);
    };
  },
});
