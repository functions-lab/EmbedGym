import { boardPinToNumber } from '@velxio/utils/boardPinMapping';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { clearPhysicalPinDrives, equivalentPinDrive, resolvePinVoltage, setPhysicalPinDrive } from '@velxio/simulation/PhysicalPinDrives';
import type { PinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { physicalPinConnections, railDrive } from './physicalPinConnections';
import { registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { requestElectricalResolve } from '@velxio/simulation/spice/electricalResolveHook';
import type { BridgePinPwm } from '@velxio/simulation/BridgePinDrives';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';

export type BridgeState = 'positive' | 'negative' | 'brakeHigh' | 'brakeLow' | 'coast' | 'unknown';
export function l298nLogic(voltage: number | null, logicSupply: number): boolean | null {
  if (voltage === null) return null;
  if (!Number.isFinite(voltage) || voltage < 0 || voltage > logicSupply + 0.01) throw new Error('l298n: input outside logic supply');
  if (voltage <= 1.5) return false;
  if (voltage >= 2.3) return true;
  return null;
}
export function l298nBridge(enable: boolean | null, first: boolean | null, second: boolean | null): BridgeState {
  if (enable === false) return 'coast';
  if (enable === null || first === null || second === null) return 'unknown';
  if (first && second) return 'brakeHigh';
  if (!first && !second) return 'brakeLow';
  return first ? 'positive' : 'negative';
}

/**
 * A bridge input carrying a hardware PWM waveform that reports duty, not edges
 * (bridge boards): the bridge is in the update's `state` while that input is
 * HIGH, the first `duty` of each `period` counted from `origin`, and in `low`
 * for the rest. Times are in measurement clock units.
 */
export interface L298nPwm { low: BridgeState; duty: number; period: number; origin: number }

/** Time the PWM input has spent HIGH from its origin to `t`. */
function pwmHighTime(pwm: L298nPwm, t: number): number {
  const periods = (t - pwm.origin) / pwm.period;
  const whole = Math.floor(periods);
  return (whole * pwm.duty + Math.min(periods - whole, pwm.duty)) * pwm.period;
}

export class L298nMeasurements {
  private history: Array<{ cycle: number; state: BridgeState; pwm: L298nPwm | null }>;
  constructor(private now: () => number, private clock: number, private windowMs: number) {
    if (!Number.isFinite(windowMs) || windowMs <= 0 || windowMs > 1000) throw new Error('l298n: sampleWindowMs must be within 0..1000, excluding zero');
    this.history = [{ cycle: now(), state: 'unknown', pwm: null }];
  }
  reset(): void { this.history = [{ cycle: this.now(), state: 'unknown', pwm: null }]; }
  update(state: BridgeState, pwm: L298nPwm | null = null): void {
    const cycle = this.now();
    const last = this.history[this.history.length - 1];
    if (cycle < last.cycle) throw new Error('l298n: CPU clock moved backwards');
    const samePwm = pwm === null || last.pwm === null ? pwm === last.pwm :
      pwm.low === last.pwm.low && pwm.duty === last.pwm.duty && pwm.period === last.pwm.period && pwm.origin === last.pwm.origin;
    if (state !== last.state || !samePwm) this.history.push({ cycle, state, pwm });
    this.prune(cycle);
  }
  private prune(cycle: number): void {
    const start = cycle - this.clock * this.windowMs / 1000;
    while (this.history.length > 1 && this.history[1].cycle <= start) this.history.shift();
  }
  get state(): BridgeState {
    const { state, pwm } = this.history[this.history.length - 1];
    let current = state;
    if (pwm) {
      const periods = (this.now() - pwm.origin) / pwm.period;
      if (periods - Math.floor(periods) >= pwm.duty) current = pwm.low;
    }
    if (current === 'unknown') throw new Error('l298n: bridge inputs or supply are unresolved');
    return current;
  }
  fractions(): Record<Exclude<BridgeState, 'unknown'>, number> {
    const end = this.now();
    this.prune(end);
    const start = Math.max(this.history[0].cycle, end - this.clock * this.windowMs / 1000);
    const result = { positive: 0, negative: 0, brakeHigh: 0, brakeLow: 0, coast: 0 };
    if (end === start) throw new Error('l298n: sample window has no CPU time');
    const add = (state: BridgeState, duration: number) => {
      if (duration <= 0) return;
      if (state === 'unknown') throw new Error('l298n: sample window contains unresolved inputs or supply');
      result[state] += duration / (end - start);
    };
    for (let i = 0; i < this.history.length; i++) {
      const event = this.history[i];
      const from = Math.max(start, event.cycle);
      const to = Math.min(end, this.history[i + 1]?.cycle ?? end);
      if (to <= from) continue;
      const high = event.pwm ? pwmHighTime(event.pwm, to) - pwmHighTime(event.pwm, from) : to - from;
      add(event.state, high);
      if (event.pwm) add(event.pwm.low, to - from - high);
    }
    return result;
  }
}

export interface L298nJumpers { regulatorJumper: boolean; enaJumper: boolean; enbJumper: boolean }
export function l298nSupply(component: string, jumpers: L298nJumpers): { motor: PinDrive | null; logic: PinDrive | null } {
  for (const key of ['regulatorJumper', 'enaJumper', 'enbJumper'] as const) if (typeof jumpers[key] !== 'boolean') throw new Error('l298n: jumpers must be boolean');
  const circuit = useSimulatorStore.getState();
  const connections = (pin: string) => physicalPinConnections(circuit, component, pin);
  const ground = connections('GND');
  const grounded = ground.some((path) => path.resistance === 0 && railDrive(circuit, path)?.voltage === 0);
  for (const path of ground) {
    if (path.endpoint.componentId === component && ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].includes(path.endpoint.pinName)) continue;
    const rail = railDrive(circuit, path);
    if (rail && (rail.voltage !== 0 || path.resistance !== 0)) throw new Error('l298n: GND requires direct common ground');
    if (!rail && path.endpoint.pinName !== 'GND' && path.endpoint.pinName !== '−') throw new Error('l298n: unsupported common-ground topology');
  }
  for (const [pin, installed] of [['ENA', jumpers.enaJumper], ['ENB', jumpers.enbJumper]] as const) {
    if (installed && connections(pin).some((path) => path.resistance === 0 &&
        (railDrive(circuit, path)?.voltage === 0 || (grounded && path.endpoint.componentId === component && path.endpoint.pinName === 'GND')))) {
      throw new Error(`l298n: ${pin} jumper shorts to common ground; remove the enable jumper`);
    }
  }
  const source = (pin: string): PinDrive | null => {
    const paths = connections(pin);
    const drives = new Map<string, PinDrive>();
    for (const path of paths) {
      const rail = railDrive(circuit, path);
      if (rail !== null) {
        if (pin === '+5V' && rail.voltage === 0 && path.resistance > 0) continue;
        const key = `${path.endpoint.componentId}:${path.endpoint.pinName}`;
        if (drives.has(key)) throw new Error('l298n: parallel supply paths require the electrical solver');
        drives.set(key, rail); continue;
      }
      const part = circuit.components.find((candidate) => candidate.id === path.endpoint.componentId);
      if (part?.metadataId === 'l298n' && pin === '+5V' && path.endpoint.pinName === pin) throw new Error('l298n: shared module +5V connections are unsupported');
      if ((part?.metadataId === 'l298n' && path.endpoint.pinName === pin) ||
          (pin === '+5V' && ((part?.metadataId === 'mpr121' && path.endpoint.pinName === 'VIN') ||
          (part?.metadataId === 'relay-module' && path.endpoint.pinName === 'VCC')))) continue;
      if (part?.metadataId !== 'battery-9v' && part?.metadataId !== 'power-supply') throw new Error(`l298n: unsupported ${pin} supply topology`);
      const positive = part.metadataId === 'battery-9v' ? '+' : 'SIG';
      if (path.endpoint.pinName !== positive) throw new Error(`l298n: ${pin} requires the source positive terminal`);
      const negative = part.metadataId === 'battery-9v' ? '−' : 'GND';
      const common = physicalPinConnections(circuit, part.id, negative).some((connection) => connection.resistance === 0 && railDrive(circuit, connection)?.voltage === 0);
      if (!common || !grounded) throw new Error('l298n: source negative and module GND require common board ground');
      const voltage = part.metadataId === 'battery-9v' ? 9 : Number(part.properties?.voltage ?? 5);
      const limit = Number(part.properties?.currentLimit ?? 1);
      if (part.metadataId === 'power-supply' && (String(part.properties?.mode ?? 'dc') !== 'dc' || !Number.isFinite(limit) || limit <= 0)) throw new Error('l298n: supply requires DC and a positive currentLimit');
      if (!Number.isFinite(voltage) || voltage <= 0) throw new Error('l298n: invalid source voltage');
      const key = `${part.id}:${positive}`;
      if (drives.has(key)) throw new Error('l298n: parallel supply paths require the electrical solver');
      drives.set(key, { voltage, resistance: path.resistance + (part.metadataId === 'battery-9v' ? 1.5 : Math.max(0.01, voltage / (Math.max(0.01, limit) * 1.5))) });
    }
    if (drives.size > 1) throw new Error(`l298n: ${pin} requires a single supply source`);
    return [...drives.values()][0] ?? null;
  };
  const motor = source('+12V');
  if (motor && (motor.voltage < 5 || motor.voltage > 35)) throw new Error('l298n: motor supply must be 5..35V');
  const externalLogic = source('+5V');
  if (jumpers.regulatorJumper && externalLogic) throw new Error('l298n: external +5V source conflicts with regulator jumper');
  if (jumpers.regulatorJumper && motor && (motor.voltage < 6 || motor.voltage > 12)) throw new Error('l298n: regulator jumper requires 6..12V motor supply');
  if (externalLogic && (externalLogic.voltage < 4.5 || externalLogic.voltage > 7)) throw new Error('l298n: logic supply must be 4.5..7V');
  if (!grounded) return { motor: null, logic: null };
  return { motor, logic: jumpers.regulatorJumper ? (motor ? { voltage: 5, resistance: 0.01 } : null) : externalLogic };
}

PartSimulationRegistry.register('l298n', {
  attachEvents: (element, simulator, getPin, componentId) => {
    const sim = simulator as any;
    if (!sim.cpuInitialized) return () => {};
    if (typeof sim.onResolvedPinVoltage !== 'function' || typeof sim.setExternalPinDrive !== 'function') throw new Error('l298n: target requires CPU-clock physical pin drives');
    const el = element as HTMLElement & L298nJumpers & { sampleWindowMs: number; [key: string]: unknown };
    const circuit = useSimulatorStore.getState();
    // Bridge boards (ESP32-S3, nRF52840) count the worker's virtual ns and
    // report hardware PWM as duty (getPinPwm) instead of edges.
    const virtualClock = typeof sim.getVirtualTimeNs === 'function';
    const clockHz: number = virtualClock ? 1e9 : sim.getClockHz();
    const now = (): number => virtualClock ? sim.getVirtualTimeNs() : sim.getCurrentCycles();
    const pwmOf = (gpio: number): BridgePinPwm | null => typeof sim.getPinPwm === 'function' ? sim.getPinPwm(gpio) : null;
    const measurements = ['A', 'B'].map(() => new L298nMeasurements(now, clockHz, el.sampleWindowMs));
    const inputs = ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'];
    const grounded = physicalPinConnections(circuit, componentId, 'GND').some((path) => path.resistance === 0 && railDrive(circuit, path)?.voltage === 0);
    const cleanup: Array<() => void> = [];
    const bindings = new Map<string, { gpio: number; resistance: number }>();
    const paths = new Map(inputs.map((pin) => [pin, physicalPinConnections(circuit, componentId, pin)]));
    const outputBindings = new Map<string, { gpio: number; resistance: number }>();
    const probedOutputs = new Set<string>();
    for (const pin of ['OUT1', 'OUT2', 'OUT3', 'OUT4']) {
      for (const path of physicalPinConnections(circuit, componentId, pin)) {
        probedOutputs.add(pin);
        const part = circuit.components.find((candidate) => candidate.id === path.endpoint.componentId);
        if (part?.metadataId === 'instr-voltmeter' && ['V+', 'V-'].includes(path.endpoint.pinName)) continue;
        const board = circuit.boards.find((candidate) => candidate.id === path.endpoint.componentId);
        const gpio = board ? boardPinToNumber(board.boardKind, path.endpoint.pinName) : null;
        if (gpio === null || gpio < 0 || railDrive(circuit, path) !== null) throw new Error('l298n: nominal unloaded outputs support only high-impedance MCU probes');
        if (outputBindings.has(pin)) throw new Error('l298n: each nominal output supports one high-impedance probe');
        outputBindings.set(pin, { gpio, resistance: path.resistance });
      }
    }
    for (const pin of inputs) {
      const gpio = getPin(pin);
      const connections = paths.get(pin)!;
      const cpuBranches = connections.filter((path) => circuit.boards.some((board) => board.id === path.endpoint.componentId) && railDrive(circuit, path) === null);
      if (cpuBranches.length > 1) throw new Error(`l298n: ${pin} supports one MCU input branch`);
      if (gpio !== null && gpio >= 0) {
        const branches = connections.filter(({ endpoint }) => {
          const board = circuit.boards.find((candidate) => candidate.id === endpoint.componentId);
          return board && boardPinToNumber(board.boardKind, endpoint.pinName) === gpio;
        });
        if (branches.length !== 1) throw new Error(`l298n: ${pin} needs one MCU branch`);
        bindings.set(pin, { gpio, resistance: branches[0].resistance });
      }
      for (const path of connections) {
        if (path.endpoint.componentId === componentId && path.endpoint.pinName === 'GND') continue;
        if (path.endpoint.componentId === componentId && inputs.includes(path.endpoint.pinName) && path.resistance === 0 && cpuBranches.length === 0 &&
            connections.some((candidate) => candidate.resistance === 0 && (railDrive(circuit, candidate)?.voltage === 0 ||
              (grounded && candidate.endpoint.componentId === componentId && candidate.endpoint.pinName === 'GND')))) continue;
        const part = circuit.components.find((candidate) => candidate.id === path.endpoint.componentId);
        if (connections.some((candidate) => railDrive(circuit, candidate)?.voltage === 0 || (candidate.endpoint.componentId === componentId && candidate.endpoint.pinName === 'GND')) &&
            ((part?.metadataId === 'battery-9v' && path.endpoint.pinName === '−') || (part?.metadataId === 'power-supply' && path.endpoint.pinName === 'GND'))) continue;
        if (railDrive(circuit, path) !== null || circuit.boards.some((board) => board.id === path.endpoint.componentId)) continue;
        throw new Error(`l298n: unsupported ${pin} input topology`);
      }
    }
    // A PWM waveform spends part of each period LOW.
    const drivesLow = (gpio: number) => pwmOf(gpio) !== null || sim.getPinMode(gpio) === 'output-low';
    let updating = false;
    let disposed = false;
    const update = () => {
      if (updating || disposed) return;
      updating = true;
      try {
        const supply = l298nSupply(componentId, el);
        const drive = (pin: string, value: PinDrive | null) => {
          if (setPhysicalPinDrive(componentId, pin, 'l298n', value)) requestElectricalResolve();
          const binding = outputBindings.get(pin);
          if (binding) {
            if (sim.getPinMode(binding.gpio) !== 'input') throw new Error('l298n: nominal output probe must remain high impedance');
            const probeSupply = sim.mcuPinDrive('output-high').voltage;
            if (value && value.voltage > probeSupply) throw new Error(`l298n: motor output exceeds the nominal ${probeSupply}V MCU probe supply`);
            sim.setExternalPinDrive(binding.gpio, `${componentId}:${pin}`, value === null ? null : { voltage: value.voltage, resistance: value.resistance + binding.resistance });
          }
        };
        drive('+5V', el.regulatorJumper ? supply.logic : null);
        // Each input's logic level; a PWM-driven input's at both of its levels.
        const levels = inputs.map((pin) => {
          const binding = bindings.get(pin);
          const local: Array<PinDrive | null> = paths.get(pin)!.map((path) => path.endpoint.componentId === componentId && path.endpoint.pinName === 'GND' && supply.logic
            ? { voltage: 0, resistance: Math.max(0.01, path.resistance) } : railDrive(circuit, path));
          const jumper = pin === 'ENA' ? el.enaJumper : pin === 'ENB' ? el.enbJumper : false;
          const jumperSource = jumper ? supply.logic : null;
          local.push(jumperSource);
          drive(pin, jumperSource);
          const logicWith = (mcu: PinDrive | null) => supply.logic ? l298nLogic(resolvePinVoltage([...local, mcu]), supply.logic.voltage) : null;
          if (!binding) return { high: logicWith(null), low: null, pwm: null };
          const equivalent = equivalentPinDrive(local);
          sim.setExternalPinDrive(binding.gpio, `${componentId}:${pin}`, equivalent === null ? null : { voltage: equivalent.voltage, resistance: equivalent.resistance + binding.resistance });
          if (jumper && supply.logic && drivesLow(binding.gpio)) throw new Error(`l298n: ${pin} jumper contends with MCU LOW; remove the enable jumper`);
          const viaBranch = (mode: string) => {
            const own: PinDrive | null = sim.mcuPinDrive(mode);
            return own && { voltage: own.voltage, resistance: own.resistance + binding.resistance };
          };
          const pwm = pwmOf(binding.gpio);
          if (pwm) return { high: logicWith(viaBranch('output-high')), low: logicWith(viaBranch('output-low')), pwm };
          return { high: logicWith(viaBranch(sim.getPinMode(binding.gpio))), low: null, pwm: null };
        });
        for (const [index, enable, first, second] of [[0, 0, 1, 2], [1, 5, 3, 4]]) {
          const channel = [enable, first, second];
          const pwmInputs = channel.filter((input) => levels[input].pwm !== null);
          if (pwmInputs.length > 1) throw new Error(`l298n: bridge ${'AB'[index]} has more than one PWM input; their relative phase is not modeled`);
          const bridgeWith = (pwmLow: boolean): BridgeState => supply.motor && supply.logic
            ? l298nBridge(...channel.map((input) => pwmLow && levels[input].pwm ? levels[input].low : levels[input].high) as [boolean | null, boolean | null, boolean | null])
            : 'unknown';
          const state = bridgeWith(false);
          const pwmInput = pwmInputs.length ? levels[pwmInputs[0]].pwm! : null;
          const low = pwmInput ? bridgeWith(true) : state;
          const pwm = pwmInput && low !== state
            ? { low, duty: pwmInput.duty, period: clockHz / pwmInput.frequencyHz, origin: pwmInput.originNs }
            : null;
          measurements[index].update(state, pwm);
          const pins = index === 0 ? ['OUT1', 'OUT2'] : ['OUT3', 'OUT4'];
          if (pwm) {
            const probed = pins.find((pin) => probedOutputs.has(pin));
            if (probed) throw new Error(`l298n: ${probed} switches with a PWM input; its DC probes cannot read the waveform`);
            for (const pin of pins) drive(pin, null);
            continue;
          }
          const high = state === 'positive' ? [true, false] : state === 'negative' ? [false, true] : state === 'brakeHigh' ? [true, true] : [false, false];
          // Unloaded nominal rail switches: 0.01 ohm is solver regularization,
          // not an L298 saturation, output resistance, or load-current model.
          for (let i = 0; i < 2; i++) drive(pins[i], state === 'unknown' || state === 'coast' ? null : high[i] ? supply.motor : { voltage: 0, resistance: 0.01 });
        }
      } finally { updating = false; }
    };
    for (const channel of ['A', 'B']) {
      const measurement = measurements[channel === 'A' ? 0 : 1];
      Object.defineProperty(el, `state${channel}`, { configurable: true, get: () => measurement.state });
      for (const prop of ['positive', 'negative', 'brakeHigh', 'brakeLow', 'coast']) Object.defineProperty(el, `${prop}${channel}`, { configurable: true, get: () => measurement.fractions()[prop as Exclude<BridgeState, 'unknown'>] });
      Object.defineProperty(el, `drive${channel}`, { configurable: true, get: () => { const sample = measurement.fractions(); return sample.positive - sample.negative; } });
    }
    for (const [pin, binding] of bindings) {
      cleanup.push(sim.onResolvedPinVoltage(binding.gpio, update));
      cleanup.push(() => sim.removeExternalPinDrive(binding.gpio, `${componentId}:${pin}`));
    }
    for (const [pin, binding] of outputBindings) {
      cleanup.push(sim.onResolvedPinVoltage(binding.gpio, update));
      cleanup.push(() => sim.removeExternalPinDrive(binding.gpio, `${componentId}:${pin}`));
    }
    registerSensorUpdate(componentId, (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (!['regulatorJumper', 'enaJumper', 'enbJumper'].includes(key) || typeof value !== 'boolean') throw new Error('l298n: only boolean jumper inputs may be updated');
      }
      const next = { regulatorJumper: el.regulatorJumper, enaJumper: el.enaJumper, enbJumper: el.enbJumper, ...values };
      const supply = l298nSupply(componentId, next);
      for (const [pin, jumper] of [['ENA', next.enaJumper], ['ENB', next.enbJumper]] as const) {
        const binding = bindings.get(pin);
        if (jumper && supply.logic && binding && drivesLow(binding.gpio)) throw new Error(`l298n: ${pin} jumper contends with MCU LOW; remove the enable jumper`);
      }
      Object.assign(el, values); update();
    });
    update();
    cleanup.push(sim.onCpuReset(() => { for (const measurement of measurements) measurement.reset(); update(); }));
    return () => {
      disposed = true;
      unregisterSensorUpdate(componentId);
      for (const remove of cleanup.reverse()) remove();
      clearPhysicalPinDrives(componentId); requestElectricalResolve();
      for (const channel of ['A', 'B']) for (const prop of ['state', 'positive', 'negative', 'brakeHigh', 'brakeLow', 'coast', 'drive']) delete el[`${prop}${channel}`];
    };
  },
});
