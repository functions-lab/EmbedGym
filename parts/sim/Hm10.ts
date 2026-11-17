import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { boardPinToNumber } from '@velxio/utils/boardPinMapping';
import type { Hm10Element } from '../elements/Hm10Element';
import { equivalentPinDrive, resolvePinVoltage, type PinDrive } from '@velxio/simulation/PhysicalPinDrives';
import { LEVEL_SHIFTER_CHANNELS, LEVEL_SHIFTER_PULLUP_OHMS } from '@velxio/simulation/levelShifter';
import { physicalPinConnections, railDrive } from './physicalPinConnections';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { emitPropertyChange } from '@velxio/simulation/parts/partUtils';

// The module, its pads and the phone are embedgym_parts/hm10.py's HM10Module through
// embedgym_parts/registry.py: in Pyodide on the AVR, in the backend worker on ESP32-S3
// and nRF52840. It registers on virtual pin 300 with the circuit facts it
// needs; the element's controller calls reach it as actions, and it reports
// the element's observables.
const PIN = 300;
const aliases = [['TXD', 'UART_TX'], ['RXD', 'UART_RX'], ['GND', 'GND13'], ['GND', 'GND14'], ['GND', 'GND21'], ['GND', 'GND22']];
const pads = ['RESETB', ...Array.from({ length: 12 }, (_, index) => `PIO${index}`), 'UART_CTS', 'UART_RTS'];
const reported = new Set(['connected', 'sleeping', 'resetHeld', 'keyHeld', 'remoteRxHex', 'uartRxHex', 'remoteReadHex']);
type Circuit = Parameters<typeof physicalPinConnections>[0];
type Path = ReturnType<typeof physicalPinConnections>[number];
/** embedgym_parts/hm10.py's net of a module pin, with the GPIO it reaches. */
interface Net { gpio: number | null; series: number | null; high: number | null; load: PinDrive | null }
type StateSink = (values: Record<string, unknown>) => void;

interface Hm10Simulator {
  registerSensor(type: string, pin: number, properties: Record<string, unknown>, partPins?: undefined,
    restartProperties?: () => Record<string, unknown>): boolean;
  updateSensor(pin: number, properties: Record<string, unknown>): void;
  unregisterSensor(pin: number): void;
  mcuPinDrive(mode: 'output-high'): PinDrive;
  onPartState?(pin: number, apply: StateSink): () => void;
  getBridge?(): { onPartState(pin: number, apply: StateSink): () => void; sendSensorAction(pin: number, properties: Record<string, unknown>): void };
}

const attached = new WeakSet<object>();

// The circuit with the module's aliased pads joined to their header pins.
function moduleCircuit(componentId: string): Circuit {
  const original = useSimulatorStore.getState();
  return { ...original, wires: [...original.wires, ...aliases.map(([a, b]) => ({ start: { componentId, pinName: a }, end: { componentId, pinName: b } }))] };
}

// A pin's connections outside the module (its aliases and own grounds excluded).
function modulePaths(circuit: Circuit, componentId: string, pin: string): Path[] {
  return physicalPinConnections(circuit, componentId, pin).filter((path) => {
    if (path.endpoint.componentId !== componentId) return true;
    return !aliases.some(([a, b]) => (pin === a && path.endpoint.pinName === b) || (pin === b && path.endpoint.pinName === a)) && !(pin === 'GND' && /^GND\d+$/.test(path.endpoint.pinName));
  });
}

function retainedSettings(el: Hm10Element): Record<string, unknown> {
  if (typeof el.startupConfiguration !== 'string') throw new Error('hm10: startup configuration requires JSON text');
  let startup: unknown;
  try { startup = JSON.parse(el.startupConfiguration); } catch { throw new Error('hm10: startup configuration requires valid JSON'); }
  if (startup === null || typeof startup !== 'object' || Array.isArray(startup)) throw new Error('hm10: startup configuration requires an object');
  return { mode: el.savedMode, role: el.savedRole, securityType: el.savedSecurity, pin: el.savedPin, uuid: el.savedUuid, characteristic: el.savedCharacteristic,
    ffe2: Number(el.savedSecondCharacteristic), resp: Number(el.savedWriteResponse), ...startup };
}

function requireElement(element: HTMLElement): Hm10Element {
  if (element.tagName.toLowerCase() !== 'velxio-hm10' || typeof (element as Hm10Element).bindController !== 'function') throw new Error('hm10: real registered Web Component is required');
  return element as Hm10Element;
}

/** The registration's circuit fields: the supply checked, then each pin's net. */
function moduleFields(sim: Hm10Simulator, componentId: string): Record<string, unknown> {
  const circuit = moduleCircuit(componentId);
  const paths = (pin: string) => modulePaths(circuit, componentId, pin);
  const metadataOf = (id: string) => circuit.components.find((part) => part.id === id)?.metadataId;
  const gpio = (path: Path): number | null => {
    const board = circuit.boards.find((candidate) => candidate.id === path.endpoint.componentId);
    const number = board ? boardPinToNumber(board.boardKind, path.endpoint.pinName) : null;
    return number !== null && number >= 0 ? number : null;
  };
  const foreignPart = (path: Path) => circuit.components.some((part) => part.id === path.endpoint.componentId && part.metadataId !== 'hm10');
  const ground = paths('GND');
  if (!ground.some((path) => path.resistance === 0 && railDrive(circuit, path)?.voltage === 0)) throw new Error('hm10: direct common board GND is required');
  for (const path of ground) {
    const rail = railDrive(circuit, path);
    if (rail ? rail.voltage !== 0 || path.resistance !== 0 : !foreignPart(path)) throw new Error('hm10: unsupported ground connection');
  }
  if (paths('VCC12').length) throw new Error('hm10: VCC12 is not modeled');
  const supply = paths('VCC');
  const volts = resolvePinVoltage(supply.map((path) => railDrive(circuit, path)));
  if (volts === null || !(Math.abs(volts - 3.3) <= 0.1 || Math.abs(volts - 5) <= 0.1) || supply.some((path) => !railDrive(circuit, path) && !foreignPart(path))) {
    throw new Error('hm10: VCC requires a 3.3 V or 5 V board rail');
  }
  const mcuHigh = sim.mcuPinDrive('output-high').voltage;
  // The module pin on a level-shifter channel's LVn: the MCU GPIO on its HVn,
  // whose HIGH the module sees as the LV pull-up.
  const shifted = (pin: string, path: Path) => {
    const channel = LEVEL_SHIFTER_CHANNELS.find(([, lvPin]) => lvPin === path.endpoint.pinName);
    if (!channel) throw new Error(`hm10: ${pin} reaches level-shifter ${path.endpoint.pinName}; only LV1..LV4 face the module`);
    const shifter = path.endpoint.componentId;
    const railOf = (shifterPin: string) => {
      const rails = physicalPinConnections(circuit, shifter, shifterPin).filter((candidate) => railDrive(circuit, candidate) !== null);
      if (rails.length !== 1 || rails[0].resistance !== 0) throw new Error(`hm10: level-shifter ${shifterPin} requires one direct board rail`);
      return railDrive(circuit, rails[0])!.voltage;
    };
    const lv = railOf('LV');
    if (!(railOf('HV') > lv)) throw new Error('hm10: level-shifter HV must be above LV');
    const cpus = physicalPinConnections(circuit, shifter, channel[0]).map((hvPath) => {
      const number = gpio(hvPath);
      if (number === null) throw new Error(`hm10: level-shifter ${channel[0]} connects only to an MCU GPIO, not ${hvPath.endpoint.componentId}.${hvPath.endpoint.pinName}`);
      return { gpio: number, series: path.resistance + hvPath.resistance };
    });
    if (cpus.length !== 1) throw new Error(`hm10: level-shifter ${channel[0]} connects to one MCU GPIO`);
    return { ...cpus[0], high: lv, pullUp: { voltage: lv, resistance: LEVEL_SHIFTER_PULLUP_OHMS + path.resistance } };
  };
  const net = (pin: string): Net => {
    const loads: Array<PinDrive | null> = [];
    const mcu: Array<{ gpio: number; series: number; high: number }> = [];
    for (const path of paths(pin)) {
      const rail = path.endpoint.componentId === componentId && path.endpoint.pinName === 'GND'
        ? { voltage: 0, resistance: Math.max(0.01, path.resistance) } : railDrive(circuit, path);
      const number = gpio(path);
      if (rail) loads.push(rail);
      else if (number !== null) mcu.push({ gpio: number, series: path.resistance, high: mcuHigh });
      else if (metadataOf(path.endpoint.componentId) === 'level-shifter') {
        const { pullUp, ...cpu } = shifted(pin, path);
        loads.push(pullUp);
        mcu.push(cpu);
      } else throw new Error(`hm10: ${pin} connects only to MCU GPIOs, level-shifter channels and board rails, not ${path.endpoint.componentId}.${path.endpoint.pinName}`);
    }
    if (mcu.length > 1) throw new Error(`hm10: ${pin} connects to more than one MCU GPIO`);
    return { gpio: mcu[0]?.gpio ?? null, series: mcu[0]?.series ?? null, high: mcu[0]?.high ?? null, load: equivalentPinDrive(loads) };
  };
  const padNets: Record<string, Net> = {};
  for (const pad of pads) {
    if (paths(pad).length) padNets[pad] = net(pad);
  }
  const { gpio: rxPin, ...rxNet } = net('RXD');
  return { tx_pin: net('TXD').gpio, rx_pin: rxPin, rx_net: rxPin === null ? null : rxNet, pads: padNets };
}

PartSimulationRegistry.register('hm10', {
  attachEvents: (element, simulator, _getPin, componentId) => {
    const sim = simulator as unknown as Hm10Simulator;
    if (typeof sim.registerSensor !== 'function') return () => {};
    const el = requireElement(element);
    const bridge = typeof sim.getBridge === 'function' ? sim.getBridge() : null;
    if (attached.has(sim)) throw new Error('hm10: one module per board');
    const partner = () => ({ address: el.remoteAddress, pin: el.remotePin, authenticated: el.remoteAuthenticated, bonding: el.remoteBonding,
      intervalMs: el.remoteIntervalMs, ancs: el.remoteAncs, ancsEventId: el.ancsEventId, ancsEventFlags: el.ancsEventFlags,
      ancsCategoryId: el.ancsCategoryId, ancsCategoryCount: el.ancsCategoryCount, ancsUid: el.ancsUid, ancsAppIdentifier: el.ancsAppIdentifier,
      ancsTitle: el.ancsTitle, ancsSubtitle: el.ancsSubtitle, ancsMessage: el.ancsMessage, ancsDate: el.ancsDate });
    const fields = { ...moduleFields(sim, componentId), identity: el.identity, partner: partner() };
    // The pad buttons held now: a reset re-attaches the module with them and its saved settings.
    const pressed = new Set<string>();
    const apply: StateSink = (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'status') el.showStatus(value === true);
        else if (key === 'startupConfiguration') { el.startupConfiguration = value as string; emitPropertyChange(componentId, key, value); }
        else if (reported.has(key)) (el as unknown as Record<string, unknown>)[key] = value;
        else throw new Error(`hm10: the model reported unknown state ${key}`);
      }
    };
    const release = bridge ? bridge.onPartState(PIN, apply) : sim.onPartState!(PIN, apply);
    let registered: boolean;
    try {
      registered = sim.registerSensor('hm10', PIN, { ...fields, retained: retainedSettings(el), pressed: [] }, undefined,
        () => ({ ...fields, retained: retainedSettings(el), pressed: [...pressed] }));
    } catch (error) { release(); throw error; }
    // The AVR declines until its CPU and the Python part models exist; the canvas then re-attaches the part.
    if (!registered) { release(); return () => {}; }
    attached.add(sim);
    const send = (action: string, data?: readonly number[]) => {
      const values = { action, partner: partner(), ...(data ? { data: [...data] } : {}) };
      if (bridge) bridge.sendSensorAction(PIN, values);
      else sim.updateSensor(PIN, values);
    };
    const button = (down: string, up: string, held: boolean) => {
      if (held) pressed.add(down); else pressed.delete(down);
      send(held ? down : up);
    };
    el.bindController({ remoteOn: () => send('remoteOn'), remoteOff: () => send('remoteOff'), connect: () => send('connect'),
      subscribe: () => send('subscribe'), disconnect: () => send('disconnect'),
      sendRemote: (bytes, withResponse) => send(withResponse ? 'sendRemoteWithResponse' : 'sendRemote', bytes),
      notifyRemote: (bytes) => send('notifyRemote', bytes), readRemote: () => send('readRemote'), ancsNotify: () => send('ancsNotify'),
      resetDown: () => button('resetDown', 'resetUp', true), resetUp: () => button('resetDown', 'resetUp', false),
      keyDown: () => button('keyDown', 'keyUp', true), keyUp: () => button('keyDown', 'keyUp', false) });
    return () => {
      el.bindController(null);
      sim.unregisterSensor(PIN);
      release();
      attached.delete(sim);
      el.showStatus(false);
    };
  },
});
