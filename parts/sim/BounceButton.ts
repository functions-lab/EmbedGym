/**
 * BounceButton.ts — tactile pushbutton whose contacts bounce.
 *
 * The switch is the `pushbutton` SPICE model, so the solver lands the board
 * pin's settled level from the real wiring. Each press and release then
 * bounces: counted from the instant that level lands, the pin returns to its
 * old level at 1.5 ms, reaches the new one at 3.0 ms, returns at 4.0 ms and
 * settles at 4.8 ms. It bounces every MCU input on the switch's signal nets
 * (a leg's net, or the net of a pin a leg reaches through resistors) between
 * that input's solved levels before and after the actuation, driven on the
 * board's clock; an input whose level the actuation leaves unchanged does not
 * bounce. A later actuation's bounce ends later, so the latest actuation
 * always sets the level a pin settles at.
 */

import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { drivePinAfter, emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { useElectricalStore } from '@velxio/store/useElectricalStore';
import { mcuPinNets, solvedInputLevel } from '@velxio/simulation/spice/connectDigitalInputsToMcu';

// Odd entries return the pin to its old level, even entries to the new one.
const BOUNCE_S = [1.5e-3, 3.0e-3, 4.0e-3, 4.8e-3];
const LEGS = ['1.l', '2.l', '1.r', '2.r'];

PartSimulationRegistry.register('bounce-button', {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const tracedPins = new Set<number>();
    for (const leg of LEGS) {
      const pin = getArduinoPinHelper(leg);
      if (pin !== null) tracedPins.add(pin);
    }
    if (tracedPins.size > 0 && !(simulator as { spiceDrivenInputs?: boolean }).spiceDrivenInputs) {
      throw new Error('bounce-button: the board does not take its input levels from the circuit solve');
    }

    const levels = new Map<number, boolean | null>();
    // The contact state an actuation left, until a solve of it lands. A solve
    // already under way when the button moved still has the old state.
    let actuatedTo: boolean | null = null;

    const onSolve = () => {
      const { pinNetMap, solvedComponents } = useElectricalStore.getState();
      const solved = solvedComponents.find((c) => c.id === componentId);
      const bounce = actuatedTo !== null && Boolean(solved?.properties.pressed) === actuatedTo;
      const pinNets = mcuPinNets(simulator.pinManager);
      const signalNets = new Set<string | undefined>(LEGS.map((leg) => pinNetMap.get(`${componentId}:${leg}`)));
      for (const pin of tracedPins) signalNets.add(pinNets.get(pin));
      for (const [pin, net] of pinNets) {
        if (!signalNets.has(net)) continue;
        const prev = levels.get(pin) ?? null;
        const next = solvedInputLevel(net, prev ?? undefined);
        levels.set(pin, next);
        if (!bounce || prev === null || next === null || prev === next) continue;
        if (simulator.pinManager.getOutputPins().has(pin)) continue;
        BOUNCE_S.forEach((t, i) => drivePinAfter(simulator, pin, i % 2 === 0 ? prev : next, t));
      }
      if (bounce) actuatedTo = null;
    };
    onSolve();
    const unsubscribe = useElectricalStore.subscribe((state, prev) => {
      if (state.nodeVoltages === prev.nodeVoltages) return;
      // Thrown here, an error would stop the store's other subscribers (the
      // input connector among them) and end up as a solver warning, so it is
      // rethrown on its own as an uncaught error.
      try {
        onSolve();
      } catch (err) {
        queueMicrotask(() => {
          throw err;
        });
      }
    });

    const onPress = () => {
      actuatedTo = true;
      emitPropertyChange(componentId, 'pressed', true);
    };
    const onRelease = () => {
      actuatedTo = false;
      emitPropertyChange(componentId, 'pressed', false);
    };
    element.addEventListener('button-press', onPress);
    element.addEventListener('button-release', onRelease);
    return () => {
      unsubscribe();
      element.removeEventListener('button-press', onPress);
      element.removeEventListener('button-release', onRelease);
    };
  },
});
