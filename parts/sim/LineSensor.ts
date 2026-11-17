import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { useElectricalStore } from '@velxio/store/useElectricalStore';
import { boardPinToNumber } from '@velxio/utils/boardPinMapping';
import { clearPhysicalPinDrives, equivalentPinDrive, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import type { PinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { physicalPinConnections, railDrive } from './physicalPinConnections';
import { LEVEL_SHIFTER_CHANNELS } from '@velxio/simulation/levelShifter';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { requestElectricalResolve } from '@velxio/simulation/spice/electricalResolveHook';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';
import { lineSensorDefaults, lineSensorEvaluate, shiftedOutputLoads, validateLineSensorInputs, validateLineSensorSupply } from './LineSensorModel';
import type { LineSensorInputs, LineSensorLoads } from './LineSensorModel';

type Connection = ReturnType<typeof physicalPinConnections>[number];

PartSimulationRegistry.register('line-sensor', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    const sim = simulator as any;
    if (!sim.cpuInitialized) return () => {};
    if (typeof sim.onResolvedPinVoltage !== 'function' || typeof sim.setExternalPinDrive !== 'function' || typeof sim.raiseOnClock !== 'function') throw new Error('line-sensor: target requires CPU-clock physical pin drives');
    const el = element as HTMLElement & LineSensorInputs & { showIndicators(high: readonly boolean[], powered: boolean): void };
    if (typeof el.showIndicators !== 'function') throw new Error('line-sensor: registered Web Component is required');
    const circuit = useSimulatorStore.getState();
    const ground = physicalPinConnections(circuit, componentId, 'GND');
    if (!ground.some((path) => path.resistance === 0 && railDrive(circuit, path)?.voltage === 0)) throw new Error('line-sensor: GND requires direct common board ground');
    const metadataOf = (id: string) => circuit.components.find((candidate) => candidate.id === id)?.metadataId;
    for (const path of ground) {
      const rail = railDrive(circuit, path);
      if (rail && (rail.voltage !== 0 || path.resistance !== 0)) throw new Error('line-sensor: conflicting ground rail');
      const shifterGround = metadataOf(path.endpoint.componentId) === 'level-shifter' && ['GND.1', 'GND.2'].includes(path.endpoint.pinName);
      if (!rail && !shifterGround && path.endpoint.pinName !== 'GND' && path.endpoint.pinName !== '−') throw new Error('line-sensor: unsupported ground topology');
    }
    const supplyPaths = physicalPinConnections(circuit, componentId, 'VCC');
    const sources = supplyPaths.filter((path) => railDrive(circuit, path) !== null);
    if (sources.length !== 1 || sources[0].resistance > 1) throw new Error('line-sensor: VCC requires one board supply rail through at most 1Ω');
    const supplyRail = railDrive(circuit, sources[0])!.voltage;
    validateLineSensorSupply(supplyRail);
    for (const path of supplyPaths) {
      if (railDrive(circuit, path)) continue;
      const metadataId = metadataOf(path.endpoint.componentId);
      const allowed = (metadataId === 'line-sensor' && path.endpoint.pinName === 'VCC') ||
        (metadataId === 'mpr121' && path.endpoint.pinName === 'VIN') ||
        (metadataId === 'relay-module' && path.endpoint.pinName === 'VCC') ||
        (metadataId === 'level-shifter' && path.endpoint.pinName === 'HV');
      if (!allowed) throw new Error('line-sensor: unsupported supply topology');
    }
    const boardGpio = (path: Connection) => {
      const board = circuit.boards.find((candidate) => candidate.id === path.endpoint.componentId);
      return board ? boardPinToNumber(board.boardKind, path.endpoint.pinName) : null;
    };
    // An output behind a level-shifter channel reaches its GPIO through the
    // electrical solve of the shifter, not through a part drive on the MCU pin.
    const shiftedChannel = (pin: string, paths: Connection[]) => {
      const channel = LEVEL_SHIFTER_CHANNELS.find(([hvPin]) => hvPin === paths[0].endpoint.pinName);
      if (paths.length !== 1 || paths[0].resistance !== 0 || !channel) throw new Error(`line-sensor: ${pin} must wire directly to one level-shifter HV1..HV4 pin and nothing else`);
      const shifter = paths[0].endpoint.componentId;
      const railOf = (shifterPin: string) => {
        const rails = physicalPinConnections(circuit, shifter, shifterPin).filter((path) => railDrive(circuit, path) !== null);
        if (rails.length !== 1 || rails[0].resistance !== 0) throw new Error(`line-sensor: level-shifter ${shifterPin} requires one direct board rail`);
        return railDrive(circuit, rails[0])!.voltage;
      };
      const hv = railOf('HV');
      const lv = railOf('LV');
      if (sources[0].resistance !== 0 || hv !== supplyRail) throw new Error('line-sensor: a shifted output requires VCC and level-shifter HV directly on the same board rail');
      const mcuHigh = sim.mcuPinDrive('output-high').voltage;
      if (lv !== mcuHigh || !(hv > lv)) throw new Error(`line-sensor: level-shifter LV must be the MCU's ${mcuHigh} V I/O rail, below HV`);
      const cpus = physicalPinConnections(circuit, shifter, channel[1]).map((path) => {
        const gpio = boardGpio(path);
        if (gpio === null || gpio < 0 || path.resistance > 1000) throw new Error(`line-sensor: level-shifter ${channel[1]} supports only MCU inputs through at most 1kΩ`);
        return { gpio, resistance: path.resistance };
      });
      if (cpus.length > 1) throw new Error('line-sensor: each output supports one MCU input');
      return { hv, lv, cpu: cpus[0] };
    };
    const names = ['L', 'M', 'R'];
    const bindings = names.map((pin) => {
      let paths: Connection[];
      try { paths = physicalPinConnections(circuit, componentId, pin); } catch (error) {
        throw new Error(`line-sensor: coupled series-supply/output-load topology is unsupported (${String(error)})`);
      }
      if (paths.some((path) => metadataOf(path.endpoint.componentId) === 'level-shifter')) {
        return { loads: [], cpu: undefined, shifted: shiftedChannel(pin, paths) };
      }
      const loads: Array<PinDrive & { localSupply: boolean }> = [];
      const cpus: Array<{ gpio: number; resistance: number }> = [];
      for (const path of paths) {
        const rail = railDrive(circuit, path);
        if (rail || (path.endpoint.componentId === componentId && ['VCC', 'GND'].includes(path.endpoint.pinName))) {
          const voltage = rail?.voltage ?? (path.endpoint.pinName === 'VCC' ? supplyRail : 0);
          if (path.resistance < (voltage === 0 ? 10000 : 30000)) throw new Error('line-sensor: load must be ≥10kΩ to GND or ≥30kΩ to VCC');
          if (voltage !== 0 && voltage !== supplyRail) throw new Error('line-sensor: output pulls require GND or the module supply rail');
          loads.push({ voltage, resistance: path.resistance, localSupply: path.endpoint.componentId === componentId && path.endpoint.pinName === 'VCC' });
          continue;
        }
        const gpio = boardGpio(path);
        if (gpio === null || gpio < 0 || path.resistance > 1000) throw new Error(`line-sensor: unsupported ${pin} load topology`);
        cpus.push({ gpio, resistance: path.resistance });
      }
      if (cpus.length > 1) throw new Error('line-sensor: each output supports one MCU input');
      return { loads, cpu: cpus[0], shifted: undefined };
    });
    let input = Object.fromEntries(Object.entries(lineSensorDefaults).map(([key, value]) => [key, el[key as keyof LineSensorInputs] ?? value])) as unknown as LineSensorInputs;
    validateLineSensorInputs(input);
    let measured = lineSensorEvaluate(supplyRail, input, [[], [], []]);
    let updating = false;
    let disposed = false;
    let failure: Error | null = null;
    const previous = new Map<string, PinDrive>();
    const update = () => {
      if (updating || disposed) return;
      updating = true;
      try {
        const state = useElectricalStore.getState();
        const raw = (pin: string): number | null => {
          if (!state.solvedComponents.some((part) => part.id === componentId)) return null;
          const net = state.pinNetMap.get(`${componentId}:${pin}`);
          return net === '0' ? 0 : net ? state.nodeVoltages[net] ?? null : null;
        };
        const supply = raw('VCC');
        const groundVoltage = raw('GND');
        if (state.solvedComponents.some((part) => part.id === componentId) && (supply === null || groundVoltage === null)) throw new Error('line-sensor: electrical solve is missing module rails');
        const volts = supply !== null && groundVoltage !== null ? supply - groundVoltage : supplyRail;
        const loads = bindings.map((binding): LineSensorLoads => {
          if (binding.shifted) {
            const { hv, lv, cpu } = binding.shifted;
            const lvLoads: PinDrive[] = [];
            if (cpu) {
              const mode = sim.getPinMode(cpu.gpio);
              if (mode !== 'input' && mode !== 'input-pullup') throw new Error('line-sensor: a shifted output MCU connection must remain an input without pull-down');
              const pull = sim.mcuPinDrive(mode);
              if (pull) lvLoads.push({ voltage: pull.voltage, resistance: pull.resistance + cpu.resistance });
            }
            return (high) => shiftedOutputLoads(high, hv, lv, lvLoads);
          }
          const sources = binding.loads.map((load) => ({ voltage: load.localSupply ? volts : load.voltage, resistance: load.resistance }));
          if (binding.cpu) {
            const mode = sim.getPinMode(binding.cpu.gpio);
            if (mode !== 'input' && mode !== 'input-pullup' && mode !== 'input-pulldown') throw new Error('line-sensor: output MCU connection must remain an input');
            const pull = sim.mcuPinDrive(mode);
            if (pull) sources.push({ voltage: pull.voltage, resistance: pull.resistance + binding.cpu.resistance });
          }
          const groundConductance = sources.filter((load) => load.voltage === 0).reduce((sum, load) => sum + 1 / load.resistance, 0);
          const pullConductance = sources.filter((load) => load.voltage > 0).reduce((sum, load) => sum + 1 / load.resistance, 0);
          if (groundConductance > 1 / 10000 + 1e-12 || pullConductance > 1 / 30000 + 1e-12) throw new Error('line-sensor: aggregate output loading exceeds the nominal envelope');
          return sources;
        });
        measured = lineSensorEvaluate(volts, input, loads);
        failure = null;
        const drive = (pin: string, value: PinDrive) => {
          const old = previous.get(pin);
          if (old && Math.abs(old.voltage - value.voltage) < 1e-7 && Math.abs(old.resistance - value.resistance) < 1e-4) return;
          previous.set(pin, value);
          setPhysicalPinDrive(componentId, pin, 'line-sensor', value);
          requestElectricalResolve();
        };
        drive('VCC', { voltage: 0, resistance: volts / measured.supplyCurrent });
        for (let i = 0; i < 3; i++) {
          const channel = measured.channels[i];
          drive(names[i], channel.drive);
          const cpu = bindings[i].cpu;
          if (cpu) {
            const externalLoads = bindings[i].loads.map((load) => ({ voltage: load.localSupply ? volts : load.voltage, resistance: load.resistance }));
            const equivalent = equivalentPinDrive([channel.drive, ...externalLoads])!;
            sim.setExternalPinDrive(cpu.gpio, `${componentId}:${names[i]}`, { voltage: equivalent.voltage, resistance: equivalent.resistance + cpu.resistance });
          }
        }
        el.showIndicators(measured.channels.map((channel) => channel.high), true);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        throw failure;
      } finally { updating = false; }
    };
    const cleanup: Array<() => void> = [];
    for (const binding of bindings) {
      const cpu = binding.cpu ?? binding.shifted?.cpu;
      if (!cpu) continue;
      if (binding.cpu) cleanup.push(sim.onResolvedPinVoltage(cpu.gpio, update));
      const removeMode = sim.onPinModeChange(cpu.gpio, update);
      if (!removeMode) throw new Error('line-sensor: missing MCU mode subscription');
      cleanup.push(removeMode);
    }
    cleanup.push(useElectricalStore.subscribe((next, prev) => {
      if (next.nodeVoltages !== prev.nodeVoltages || next.pinNetMap !== prev.pinNetMap) {
        try { update(); } catch (error) {
          // Service publication catches subscriber errors. Re-raise on the
          // simulated clock so serial-only runs also fail instead of using stale IO.
          sim.raiseOnClock(error);
          throw error;
        }
      }
    }));
    cleanup.push(sim.onCpuReset(update));
    const apply = (values: Record<string, unknown>) => {
      for (const key of Object.keys(values)) if (!(key in lineSensorDefaults)) throw new Error(`line-sensor: unknown physical input '${key}'`);
      const next = { ...input, ...values } as LineSensorInputs;
      validateLineSensorInputs(next);
      input = next;
      Object.assign(el, next);
      update();
      for (const [key, value] of Object.entries(values)) emitPropertyChange(componentId, key, value);
    };
    const onInput = (event: Event) => apply((event as CustomEvent).detail);
    el.addEventListener('line-sensor-input', onInput);
    registerSensorUpdate(componentId, apply);
    Object.assign(el, input);
    for (let i = 0; i < 3; i++) {
      Object.defineProperty(el, `${['left', 'middle', 'right'][i]}Voltage`, { configurable: true, get: () => { if (failure) throw failure; return measured.channels[i].voltage; } });
    }
    Object.defineProperty(el, 'supplyCurrent', { configurable: true, get: () => { if (failure) throw failure; return measured.supplyCurrent; } });
    Object.defineProperty(el, 'supplyVoltage', { configurable: true, get: () => { if (failure) throw failure; return measured.supplyVoltage; } });
    const dispose = () => {
      disposed = true;
      el.removeEventListener('line-sensor-input', onInput);
      unregisterSensorUpdate(componentId);
      for (const remove of cleanup.reverse()) remove();
      for (let i = 0; i < 3; i++) {
        if (bindings[i].cpu) sim.removeExternalPinDrive(bindings[i].cpu!.gpio, `${componentId}:${names[i]}`);
        delete (el as any)[`${['left', 'middle', 'right'][i]}Voltage`];
      }
      delete (el as any).supplyCurrent;
      delete (el as any).supplyVoltage;
      clearPhysicalPinDrives(componentId);
      requestElectricalResolve();
      el.showIndicators([], false);
    };
    try { update(); } catch (error) { dispose(); throw error; }
    return dispose;
  },
});
