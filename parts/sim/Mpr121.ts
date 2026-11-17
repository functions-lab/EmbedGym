import { boardPinToNumber } from '@velxio/utils/boardPinMapping';
import type { PinDrive } from '@velxio/simulation/PhysicalPinDrives';
import type { LocalPartPins } from '@velxio/simulation/python/PythonModels';
import { clearPhysicalPinDrives, equivalentPinDrive, getPhysicalPinDrives, resolvePinVoltage, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { physicalPinConnections, railDrive } from './physicalPinConnections';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { requestElectricalResolve } from '@velxio/simulation/spice/electricalResolveHook';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

export interface Mpr121Inputs {
  capacitance: number[];
  pressed: boolean[];
  rextOvercurrent: boolean;
}

export function mpr121Address(component: string, explicit: number | string | undefined): number {
  const circuit = useSimulatorStore.getState();
  const paths = physicalPinConnections(circuit, component, 'ADDR');
  const connections = paths.filter((connection) => connection.resistance === 0);
  if (!connections.length && paths.length) throw new Error('mpr121: ADDR strap requires a direct GND, 3Vo, SDA or SCL connection');
  const ownPads = connections.filter(({ endpoint }) => endpoint.componentId === component).map(({ endpoint }) => endpoint.pinName);
  const grounded = connections.some((connection) => railDrive(circuit, connection)?.voltage === 0);
  const options = new Set<number>();
  if (grounded || ownPads.includes('GND')) options.add(0x5a);
  if (ownPads.includes('3Vo')) options.add(0x5b);
  const busConnections = (pin: string) => physicalPinConnections(circuit, component, pin).filter((connection) => connection.resistance === 0);
  for (const [pin, address] of [['SDA', 0x5c], ['SCL', 0x5d]] as const) {
    if (ownPads.includes(pin) || connections.some(({ endpoint }) => busConnections(pin).some((candidate) =>
      candidate.endpoint.componentId === endpoint.componentId && candidate.endpoint.pinName === endpoint.pinName))) options.add(address);
  }
  const recognized = ownPads.every((pin) => ['GND', '3Vo', 'SDA', 'SCL'].includes(pin)) && connections.every((connection) => {
    if (connection.endpoint.componentId === component) return true;
    if (railDrive(circuit, connection)?.voltage === 0) return true;
    return ['SDA', 'SCL'].some((pin) => busConnections(pin).some((candidate) =>
      candidate.endpoint.componentId === connection.endpoint.componentId && candidate.endpoint.pinName === connection.endpoint.pinName));
  });
  if (!recognized || options.size > 1) throw new Error('mpr121: ADDR must connect only to GND, 3Vo, SDA or SCL');
  let property: number | undefined;
  if (explicit !== undefined) {
    if (typeof explicit === 'number') property = explicit;
    else if (/^0x5[a-d]$/i.test(explicit)) property = Number(explicit);
    else throw new Error('mpr121: address must be 0x5A, 0x5B, 0x5C or 0x5D');
    if (![0x5a, 0x5b, 0x5c, 0x5d].includes(property)) throw new Error('mpr121: invalid address');
  }
  const strap = [...options][0];
  if (property !== undefined && strap !== undefined && property !== strap) throw new Error('mpr121: address property conflicts with ADDR strap');
  return property ?? strap ?? 0x5a;
}

export function mpr121Powered(component: string): boolean {
  const circuit = useSimulatorStore.getState();
  const vin = physicalPinConnections(circuit, component, 'VIN');
  const ground = physicalPinConnections(circuit, component, 'GND');
  const sharedSupplyInput = (connection: typeof vin[number], pin: 'VIN' | 'GND') => {
    const { endpoint } = connection;
    const part = circuit.components.find((candidate) => candidate.id === endpoint.componentId);
    return (part?.metadataId === 'relay-module' && endpoint.pinName === (pin === 'VIN' ? 'VCC' : 'GND')) ||
      (part?.metadataId === 'mpr121' && endpoint.componentId !== component && endpoint.pinName === pin);
  };
  const grounded = ground.some((connection) => connection.resistance === 0 && railDrive(circuit, connection)?.voltage === 0);
  if (ground.some((connection) => {
    const source = railDrive(circuit, connection);
    return (source !== null && (source.voltage !== 0 || connection.resistance !== 0)) ||
      (grounded && source === null && (!sharedSupplyInput(connection, 'GND') || connection.resistance !== 0));
  })) throw new Error('mpr121: GND requires only direct board ground connections');
  if (!vin.length || !grounded) return false;
  const sources = vin.filter((connection) => !sharedSupplyInput(connection, 'VIN')).map((connection) => railDrive(circuit, connection));
  if (sources.some((source) => source === null) || vin.some((connection) => connection.resistance !== 0) ||
      sources.some((source) => source!.voltage < 3 || source!.voltage > 5) ||
      new Set(sources.map((source) => source!.voltage)).size !== 1) {
    throw new Error('mpr121: VIN requires a direct supported 3..5V supply rail');
  }
  return true;
}

PartSimulationRegistry.register('mpr121', {
  attachEvents: (element, simulator, getPin, componentId, getResolver) => {
    const sim = simulator as any;
    const el = element as HTMLElement & { [key: string]: unknown; address?: string | number; pressed: boolean[]; rextOvercurrent: boolean };
    const input = (): Mpr121Inputs => ({ capacitance: Array.from({ length: 12 }, (_, i) => el[`capacitance${i}`] as number),
      pressed: el.pressed, rextOvercurrent: el.rextOvercurrent });
    const checkUpdate = (values: Record<string, unknown>) => {
      const candidate = input();
      for (const [key, value] of Object.entries(values)) {
        const cap = /^capacitance([0-9]|1[01])$/.exec(key);
        if (cap) {
          if (typeof value !== 'number') throw new Error(`mpr121: ${key} must be numeric pF`);
          candidate.capacitance[Number(cap[1])] = value;
        } else if (key === 'rextOvercurrent') {
          if (typeof value !== 'boolean') throw new Error('mpr121: rextOvercurrent must be boolean');
          candidate.rextOvercurrent = value;
        } else throw new Error(`mpr121: unknown physical input '${key}'`);
      }
      validateMpr121Inputs(candidate);
    };
    const supplyRails = (powered: boolean) => {
      const circuit = useSimulatorStore.getState();
      const result = new Map<string, number>();
      if (physicalPinConnections(circuit, componentId, 'GND').some((connection) => connection.resistance === 0 && railDrive(circuit, connection)?.voltage === 0)) result.set(`${componentId}:GND`, 0);
      if (powered) result.set(`${componentId}:3Vo`, 3.3);
      return result;
    };

    // Bridge boards: the register file, conversion clock, INT and the
    // electrodes wired to MCU GPIOs live in the backend worker's
    // MPR121Slave, which drives the other electrodes on the canvas through
    // part_pin_drive. The AVR simulator has no bridge and keeps the
    // in-browser device below.
    if (typeof sim.getBridge === 'function') {
      validateMpr121Inputs(input());
      const address = mpr121Address(componentId, el.address);
      const powered = mpr121Powered(componentId);
      const circuit = useSimulatorStore.getState();
      const rails = supplyRails(powered);
      const virtualPin = 200 + address;
      const pins: Record<string, number> = {};
      const electrodes: Record<string, { series: number | null; load: PinDrive | null; parts: boolean }> = {};
      const intPin = getPin('INT');
      if (intPin !== null && intPin >= 0) pins.int_pin = intPin;
      for (let n = 4; n < 12; n++) {
        const pin = String(n);
        const gpio = getPin(pin);
        const connections = physicalPinConnections(circuit, componentId, pin);
        const loads = connections.map((connection) => railDrive(circuit, connection, rails));
        const mcu = connections.map(({ endpoint }) => {
          const board = circuit.boards.find((candidate) => candidate.id === endpoint.componentId);
          return gpio !== null && gpio >= 0 && board !== undefined && boardPinToNumber(board.boardKind, endpoint.pinName) === gpio;
        });
        const parts = connections.some((_, i) => loads[i] === null && !mcu[i]);
        let series: number | null = null;
        if (gpio !== null && gpio >= 0) {
          const paths = connections.filter((_, i) => mcu[i]);
          if (paths.length !== 1) throw new Error(`mpr121: electrode ${pin} requires one resolved MCU connection`);
          if (parts) throw new Error(`mpr121: electrode ${pin} on GPIO ${gpio} may share its net only with rail resistors on this board`);
          pins[`e${pin}_pin`] = gpio;
          series = paths[0].resistance;
        }
        electrodes[pin] = { series, load: equivalentPinDrive(loads), parts };
      }
      const native = sim.registerSensor('mpr121', virtualPin, {
        addr: address, powered, electrodes, ...pins,
        ...Object.fromEntries(input().capacitance.map((value, i) => [`capacitance${i}`, value])),
        rextOvercurrent: el.rextOvercurrent, pressed: [...el.pressed],
      }) === true;
      if (native) {
        const release = sim.getBridge().drivePartPins(virtualPin, componentId);
        if (powered) setPhysicalPinDrive(componentId, '3Vo', 'regulator', { voltage: 3.3, resistance: 0.1 });
        if (powered && pins.int_pin === undefined) setPhysicalPinDrive(componentId, 'INT', 'pull', { voltage: 3.3, resistance: 10000 });
        requestElectricalResolve();
        registerSensorUpdate(componentId, (values) => {
          checkUpdate(values);
          sim.updateSensor(virtualPin, values);
          Object.assign(el, values);
        });
        const onTouch = () => {
          validateMpr121Inputs(input());
          sim.updateSensor(virtualPin, { pressed: [...el.pressed] });
        };
        element.addEventListener('touch-change', onTouch);
        return () => {
          sim.unregisterSensor(virtualPin);
          unregisterSensorUpdate(componentId);
          element.removeEventListener('touch-change', onTouch);
          release();
          clearPhysicalPinDrives(componentId);
          requestElectricalResolve();
        };
      }
    }

    // The AVR: the register file and conversion clock are the same
    // MPR121Slave in Pyodide; this part resolves its pins on the canvas nets
    // and the AVR's own pin drives, as AVRSimulator thresholds them.
    if (typeof sim.registerSensor !== 'function' || !sim.cpuInitialized) return () => {};
    validateMpr121Inputs(input());
    const address = mpr121Address(componentId, el.address);
    const powered = mpr121Powered(componentId);
    const circuit = useSimulatorStore.getState();
    const supplies = supplyRails(powered);
    const bindings = new Map<string, { gpio: number; resistance: number }>();
    const cleanup: Array<() => void> = [];
    for (const pin of ['INT', ...Array.from({ length: 8 }, (_, i) => String(i + 4))]) {
      const gpio = getPin(pin);
      const connections = physicalPinConnections(circuit, componentId, pin);
      if (gpio !== null && gpio >= 0) {
        const paths = connections.filter(({ endpoint }) => {
          const board = circuit.boards.find((candidate) => candidate.id === endpoint.componentId);
          return board !== undefined && boardPinToNumber(board.boardKind, endpoint.pinName) === gpio;
        });
        if (paths.length !== 1) throw new Error(`mpr121: electrode ${pin} requires one resolved MCU connection`);
        bindings.set(pin, { gpio, resistance: paths[0].resistance });
        sim.setExternalPinDrive(gpio, `${componentId}:${pin}:network`, null);
        cleanup.push(() => sim.removeExternalPinDrive(gpio, `${componentId}:${pin}:network`));
      }
    }
    const localSources = (pin: string) => {
      const sources = getPhysicalPinDrives(componentId).filter((entry) => entry.pin === pin).map((entry) => entry.drive);
      sources.push(...physicalPinConnections(circuit, componentId, pin).map((connection) => railDrive(circuit, connection, supplies)));
      return sources;
    };
    const drive = (pin: string, contribution: PinDrive | null, owner = 'output') => {
      const changed = setPhysicalPinDrive(componentId, pin, owner, powered ? contribution : null);
      const binding = bindings.get(pin);
      if (binding) {
        const equivalent = equivalentPinDrive(localSources(pin));
        sim.setExternalPinDrive(binding.gpio, `${componentId}:${pin}:network`, equivalent === null ? null :
          { voltage: equivalent.voltage, resistance: equivalent.resistance + binding.resistance });
      }
      if (changed) requestElectricalResolve();
    };
    drive('3Vo', { voltage: 3.3, resistance: 0.1 }, 'regulator');
    drive('INT', { voltage: 3.3, resistance: 10000 }, 'pull');
    const voltage = (pin: string): number | null => {
      const binding = bindings.get(pin);
      if (binding) {
        const boardVoltage = sim.getResolvedPinVoltage(binding.gpio);
        if (binding.resistance === 0) return boardVoltage;
        if (boardVoltage !== null) return resolvePinVoltage([...localSources(pin), { voltage: boardVoltage, resistance: binding.resistance }]);
      }
      const local = resolvePinVoltage(localSources(pin));
      if (local !== null) return local;
      const resolver = getResolver?.(pin);
      return resolver ? resolver.getCurrentVoltage() : null;
    };
    const release = () => {
      for (const remove of cleanup.reverse()) remove();
      clearPhysicalPinDrives(componentId);
      requestElectricalResolve();
    };
    const pins: LocalPartPins = {
      drive: (pin, contribution) => drive(pin, contribution),
      voltage,
      // A pin's change reaches the model a cycle later, outside the model's own drive.
      watch: (changed) => {
        const offs = [...bindings.values()].map(({ gpio }) =>
          sim.onResolvedPinVoltage(gpio, () => sim.scheduleClockEvent(changed, 1)) as () => void);
        return () => offs.forEach((off) => off());
      },
    };
    const virtualPin = 200 + address;
    const native = sim.registerSensor('mpr121', virtualPin, {
      addr: address, powered,
      ...Object.fromEntries(input().capacitance.map((value, i) => [`capacitance${i}`, value])),
      rextOvercurrent: el.rextOvercurrent, pressed: [...el.pressed],
    }, pins) === true;
    // The AVR declines until its CPU and the Python part models exist; the
    // canvas then re-attaches the part.
    if (!native) {
      release();
      return () => {};
    }
    registerSensorUpdate(componentId, (values) => {
      checkUpdate(values);
      sim.updateSensor(virtualPin, values);
      Object.assign(el, values);
    });
    const onTouch = () => {
      validateMpr121Inputs(input());
      sim.updateSensor(virtualPin, { pressed: [...el.pressed] });
    };
    element.addEventListener('touch-change', onTouch);
    return () => {
      sim.unregisterSensor(virtualPin);
      unregisterSensorUpdate(componentId);
      element.removeEventListener('touch-change', onTouch);
      release();
    };
  },
});

export function validateMpr121Inputs(inputs: Mpr121Inputs): void {
  if (inputs.capacitance.length !== 12 || inputs.pressed.length !== 12 ||
      inputs.pressed.some((value) => typeof value !== 'boolean') || typeof inputs.rextOvercurrent !== 'boolean') {
    throw new Error('mpr121: invalid physical inputs');
  }
  for (const value of inputs.capacitance) {
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      throw new Error('mpr121: electrode capacitance must be finite within 0..100000 pF, excluding zero');
    }
  }
}
