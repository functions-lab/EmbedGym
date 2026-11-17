/**
 * Mq2.ts — MQ-2 gas sensor module (sensor + LM393 comparator board).
 *
 * `voltage` is AO in volts at the module's rated 5 V supply (0–5, higher =
 * more gas); it reaches the ADC through the SPICE divider in
 * `spice/ratiometricSensors.ts`, so AO follows the VCC actually wired. The
 * comparator pulls DO LOW while AO is above the trim pot's `threshold` (volts
 * on the same scale, default 2.5) and releases it HIGH otherwise.
 *
 * DO wired straight to a GPIO is a direct pin level. DO on a `level-shifter`
 * HVn is the module's open-collector output with its 10 kΩ pull-up to VCC,
 * stamped into the solve, so the GPIO on LVn reads the shifter's solved level.
 */

import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { idleValue } from '@velxio/simulation/spice/ratiometricSensors';
import { requestElectricalResolve } from '@velxio/simulation/spice/electricalResolveHook';
import { clearPhysicalPinDrives, equivalentPinDrive, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import type { PinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { physicalPinConnections, railDrive } from './physicalPinConnections';
import { LEVEL_SHIFTER_CHANNELS } from '@velxio/simulation/levelShifter';

const DO_PULLUP_OHMS = 10_000;
const DO_SINK_OHMS = 50;

// The module supply when DO sits on a level-shifter HVn, else null.
function shiftedDoSupply(componentId: string): number | null {
  const circuit = useSimulatorStore.getState();
  const metadataOf = (id: string) => circuit.components.find((part) => part.id === id)?.metadataId;
  const paths = physicalPinConnections(circuit, componentId, 'DO');
  if (!paths.some((path) => metadataOf(path.endpoint.componentId) === 'level-shifter')) return null;
  const onHv = paths.length === 1 && paths[0].resistance === 0 &&
    LEVEL_SHIFTER_CHANNELS.some(([hv]) => hv === paths[0].endpoint.pinName);
  if (!onHv) throw new Error('mq2: DO must wire directly to one level-shifter HV1..HV4 pin and nothing else');
  const rails = physicalPinConnections(circuit, componentId, 'VCC').filter((path) => railDrive(circuit, path) !== null);
  if (rails.length !== 1 || rails[0].resistance !== 0) throw new Error('mq2: a shifted DO requires VCC directly on one board rail');
  return railDrive(circuit, rails[0])!.voltage;
}

PartSimulationRegistry.register('mq2', {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const shiftedSupply = shiftedDoSupply(componentId);
    const pinDO = shiftedSupply === null ? getArduinoPinHelper('DO') : null;
    const el = element as any;

    const checkVolts = (prop: 'voltage' | 'threshold', value: unknown): number => {
      if (typeof value !== 'number' || value < 0 || value > 5) {
        throw new Error(`mq2: ${prop} must be 0–5 V, got ${value}`);
      }
      return value;
    };

    let voltage = checkVolts('voltage', typeof el.voltage === 'number' ? el.voltage : idleValue('mq2', 'voltage'));
    let threshold = checkVolts('threshold', typeof el.threshold === 'number' ? el.threshold : 2.5);

    const apply = () => {
      el.voltage = voltage;
      el.threshold = threshold;
      el.detected = voltage > threshold;
      if (shiftedSupply !== null) {
        const pullUp: PinDrive = { voltage: shiftedSupply, resistance: DO_PULLUP_OHMS };
        const drive = el.detected ? equivalentPinDrive([pullUp, { voltage: 0, resistance: DO_SINK_OHMS }])! : pullUp;
        if (setPhysicalPinDrive(componentId, 'DO', 'mq2', drive)) requestElectricalResolve();
      } else if (pinDO !== null) {
        simulator.setPinState(pinDO, !el.detected);
      }
    };

    apply();

    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'voltage') {
          voltage = checkVolts('voltage', value);
        } else if (key === 'threshold') {
          threshold = checkVolts('threshold', value);
        } else {
          throw new Error(`mq2: unknown property "${key}"`);
        }
        emitPropertyChange(componentId, key, value);
      }
      apply();
    });

    return () => {
      unregisterSensorUpdate(componentId);
      if (shiftedSupply !== null) {
        clearPhysicalPinDrives(componentId);
        requestElectricalResolve();
      }
    };
  },
});
