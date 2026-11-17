// @vitest-environment jsdom
/**
 * AVRSimulator's physical pin-drive API on the bridge boards (ESP32-S3 QEMU,
 * nRF52840 Renode): BridgePinDrives fed by a real Esp32Bridge over a mock
 * WebSocket, and the L298N attached to it — GPIO edges and PWM duty, on the
 * worker's virtual clock — and the line sensor on the 3.3 V rail.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; }
  receive(payload: object) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}
vi.stubGlobal('WebSocket', MockWebSocket);
vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', vi.fn());

import { Esp32Bridge } from '@velxio/simulation/Esp32Bridge';
import { BridgePinDrives } from '@velxio/simulation/BridgePinDrives';
import { PinManager } from '@velxio/simulation/PinManager';
import { L298nMeasurements } from '../../sim/L298n';
import { L298nElement } from '../../elements/L298nElement';
import '../../elements/LineSensorElement';
import '../../sim/LineSensor';
import { useElectricalStore } from '@velxio/store/useElectricalStore';
import { REJECTED } from '@velxio/simulation/FirmwareRejected';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { dispatchSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import type { BoardKind } from '@velxio/types/board';

const MS = 1_000_000;

function bridgeBoard(kind: BoardKind) {
  const pinManager = new PinManager();
  const bridge = new Esp32Bridge('board', kind);
  // Live mode rethrows a part's rejection out of the event dispatch; grading
  // mode records it as the run's failure instead.
  bridge.gradingMode = false;
  bridge.onPinChange = (pin, state) => pinManager.triggerPinChange(pin, state, 'mcu');
  bridge.onPwmDuty = (d) => pinManager.updatePwm(d.pin, d.duty, undefined, d.frequency);
  bridge.onPinPull = (pin, pull) => pinManager.setPinPull(pin, pull);
  const drives = new BridgePinDrives(bridge, pinManager);
  bridge.connect();
  const ws = (bridge as unknown as { socket: MockWebSocket }).socket;
  ws.onopen?.();
  // The Esp32BridgeShim surface a part sees.
  const sim = {
    cpuInitialized: true,
    pinManager,
    getVirtualTimeNs: () => bridge.virtualTimeNs,
    raiseOnClock: (error: unknown) => bridge.partRaised(error),
    ...Object.fromEntries((['getPinMode', 'getPinPwm', 'mcuPinDrive', 'onPinModeChange', 'onResolvedPinVoltage', 'onCpuReset',
      'setExternalPinDrive', 'removeExternalPinDrive', 'getResolvedPinVoltage'] as const).map((name) => [name, drives[name].bind(drives)])),
  };
  const gpioIn = () => ws.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'esp32_gpio_in').map((f) => [f.data.pin, f.data.state]);
  return {
    bridge, ws, drives, sim, pinManager, gpioIn,
    dir: (pin: number, dir: 0 | 1, tMs: number, pull?: 0 | 1 | 2) => ws.receive({ type: 'gpio_dir', data: { pin, dir, ...(pull === undefined ? {} : { pull }), t_ns: tMs * MS } }),
    level: (pin: number, state: 0 | 1, tMs: number) => ws.receive({ type: 'gpio_change', data: { pin, state, t_ns: tMs * MS } }),
    pwm: (pin: number, duty: number, frequency: number, tMs: number) => ws.receive({ type: 'pwm_duty', data: { pin, duty, frequency, t_ns: tMs * MS } }),
    park: (tMs: number) => ws.receive({ type: 'run_stopped', data: { t_ns: tMs * MS } }),
  };
}

describe('BridgePinDrives', () => {
  it('reports modes from worker directions, output edges and both pull reports', () => {
    const esp = bridgeBoard('esp32-s3');
    const modes: string[] = [];
    esp.drives.onPinModeChange(4, (mode) => modes.push(mode));
    expect(esp.drives.getPinMode(4)).toBe('input');
    esp.dir(4, 1, 1); esp.level(4, 1, 2); esp.level(4, 0, 3);
    esp.dir(4, 0, 4); esp.ws.receive({ type: 'gpio_pull', data: { pin: 4, pull: 1 } });
    esp.ws.receive({ type: 'gpio_pull', data: { pin: 4, pull: 2 } });
    expect(modes).toEqual(['output-low', 'output-high', 'output-low', 'input', 'input-pullup', 'input-pulldown']);
    expect(esp.pinManager.getPinPull(4)).toBe(2);

    const nrf = bridgeBoard('nrf52840-dk');
    nrf.dir(47, 0, 1, 1);
    expect(nrf.drives.getPinMode(47)).toBe('input-pullup');
    expect(nrf.drives.mcuPinDrive('input-pullup')).toEqual({ voltage: 3.3, resistance: 13_000 });
    expect(esp.drives.mcuPinDrive('input-pulldown')).toEqual({ voltage: 0, resistance: 45_000 });
    expect(esp.drives.mcuPinDrive('output-high')).toEqual({ voltage: 3.3, resistance: 25 });
  });

  it('sends a part-driven input level at the datasheet thresholds, never to an output', () => {
    const esp = bridgeBoard('esp32-s3');
    esp.drives.setExternalPinDrive(5, 'part:L', { voltage: 2.5, resistance: 100 });
    esp.drives.setExternalPinDrive(5, 'part:L', { voltage: 0.8, resistance: 100 });
    expect(esp.gpioIn()).toEqual([[5, 1], [5, 0]]);
    esp.dir(5, 1, 1); esp.drives.setExternalPinDrive(5, 'part:L', { voltage: 3.3, resistance: 100 });
    expect(esp.gpioIn()).toHaveLength(2);
    esp.dir(5, 0, 2);
    expect(esp.gpioIn()).toEqual([[5, 1], [5, 0], [5, 1]]);
    expect(esp.drives.hasExternalPinDrive(5)).toBe(true);
    esp.drives.removeExternalPinDrive(5, 'part:L');
    expect(esp.drives.hasExternalPinDrive(5)).toBe(false);

    const nrf = bridgeBoard('nrf52840-dk');
    nrf.drives.setExternalPinDrive(36, 'part:L', { voltage: 2.35, resistance: 100 });
    nrf.drives.setExternalPinDrive(36, 'part:L', { voltage: 0.95, resistance: 100 });
    expect(nrf.gpioIn()).toEqual([[36, 1], [36, 0]]);
  });

  it('rejects a part-driven input between VIL and VIH, or above the 3.6 V pad limit', () => {
    const esp = bridgeBoard('esp32-s3');
    expect(() => esp.drives.setExternalPinDrive(5, 'part:L', { voltage: 2.4, resistance: 100 }))
      .toThrow('GPIO 5: part drives resolve to 2.40 V, between VIL 0.825 V and VIH 2.475 V');
    expect(() => esp.drives.setExternalPinDrive(5, 'part:L', { voltage: 5, resistance: 100 }))
      .toThrow('GPIO 5: part drives resolve to 5.00 V, above its 3.6 V limit (not 5 V tolerant)');
    // An output pin is the MCU's own drive, so no part level is judged.
    esp.dir(6, 1, 1);
    esp.drives.setExternalPinDrive(6, 'part:L', { voltage: 2.4, resistance: 100 });
    expect(esp.gpioIn()).toEqual([]);

    const nrf = bridgeBoard('nrf52840-dk');
    expect(() => nrf.drives.setExternalPinDrive(36, 'part:L', { voltage: 1.5, resistance: 100 })).toThrow('between VIL 0.990 V and VIH 2.310 V');
  });

  it('tracks a PWM waveform with its phase origin, and a saturated duty as a level', () => {
    const nrf = bridgeBoard('nrf52840-dk');
    const resolved = vi.fn();
    nrf.drives.onResolvedPinVoltage(44, resolved);
    nrf.dir(44, 1, 1);
    nrf.pwm(44, 0.25, 1000, 10);
    expect(nrf.drives.getPinPwm(44)).toEqual({ duty: 0.25, frequencyHz: 1000, originNs: 10 * MS });
    expect(() => nrf.drives.getPinMode(44)).toThrow('PWM waveform');
    nrf.pwm(44, 0.5, 1000, 20);
    expect(nrf.drives.getPinPwm(44)!.originNs).toBe(10 * MS);
    nrf.pwm(44, 0.5, 2000, 30);
    expect(nrf.drives.getPinPwm(44)!.originNs).toBe(30 * MS);
    nrf.pwm(44, 1, 0, 40);
    expect(nrf.drives.getPinPwm(44)).toBeNull();
    expect(nrf.drives.getPinMode(44)).toBe('output-high');
    nrf.pwm(44, 0, 0, 50);
    expect(nrf.drives.getPinMode(44)).toBe('output-low');
    expect(resolved).toHaveBeenCalledTimes(6);
    expect(() => nrf.pinManager.updatePwm(44, 0.5, undefined, 0)).toThrow('no frequency');
  });

  it('starts every guest run with worker state cleared and resets its parts', () => {
    const esp = bridgeBoard('esp32-s3');
    const reset = vi.fn();
    esp.drives.onCpuReset(reset);
    esp.dir(4, 1, 1);
    esp.ws.onopen?.();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(esp.drives.getPinMode(4)).toBe('input');
  });

  it('refuses boards it has no electrical model for', () => {
    const classic = bridgeBoard('esp32');
    expect(() => classic.drives.mcuPinDrive('output-high')).toThrow('not modeled on esp32');
  });
});

describe('L298N measurements with a PWM input', () => {
  it('integrates partial periods and reports the phase-model instantaneous state', () => {
    let t = 0;
    const measurement = new L298nMeasurements(() => t, 1000, 1000);
    measurement.update('positive', { low: 'coast', duty: 0.25, period: 10, origin: 0 });
    t = 15;
    const fractions = measurement.fractions();
    expect(fractions.positive).toBeCloseTo(5 / 15, 12);
    expect(fractions.coast).toBeCloseTo(10 / 15, 12);
    t = 21; expect(measurement.state).toBe('positive');
    t = 23; expect(measurement.state).toBe('coast');
  });
});

const wire = (a: string, ap: string, b: string, bp: string) => ({ id: `${a}:${ap}:${b}:${bp}`, start: { componentId: a, pinName: ap, x: 0, y: 0 }, end: { componentId: b, pinName: bp, x: 0, y: 0 } });
const power = [wire('driver', '+12V', 'battery', '+'), wire('battery', '−', 'board', 'GND.1'), wire('driver', 'GND', 'board', 'GND.1')];

describe('L298N on a bridge board', () => {
  afterEach(() => useSimulatorStore.setState({ wires: [], components: [], boards: [] }));

  function attach(kind: BoardKind, pins: Record<string, string>, extra: ReturnType<typeof wire>[] = [], jumpers = {}) {
    useSimulatorStore.setState({ boards: [{ id: 'board', boardKind: kind }] as any,
      components: [{ id: 'driver', metadataId: 'l298n' }, { id: 'battery', metadataId: 'battery-9v' }] as any,
      wires: [...power, ...Object.entries(pins).map(([pin, gpio]) => wire('driver', pin, 'board', gpio)), ...extra] as any });
    const board = bridgeBoard(kind);
    const el = document.createElement('velxio-l298n') as L298nElement & Record<string, any>;
    Object.assign(el, { regulatorJumper: true, enaJumper: false, enbJumper: false, sampleWindowMs: 100, ...jumpers });
    const gpio = (name: string) => pins[name] === undefined ? null : kind === 'nrf52840-dk'
      ? 32 * Number(pins[name][1]) + Number(pins[name].slice(3)) : Number(pins[name]);
    const cleanup = PartSimulationRegistry.get('l298n')!.attachEvents!(el, board.sim as any, gpio, 'driver');
    return { ...board, el, cleanup, gpio };
  }

  it('measures GPIO-driven bridges on the virtual clock', () => {
    const esp = attach('esp32-s3', { ENA: '4', IN1: '5', IN2: '6' });
    expect(() => esp.el.stateA).toThrow('unresolved');
    for (const pin of [4, 5, 6]) esp.dir(pin, 1, 1);
    esp.level(4, 1, 2); esp.level(5, 1, 2);
    expect(esp.el.stateA).toBe('positive');
    esp.level(5, 0, 72); esp.level(6, 1, 72);
    esp.park(102);
    expect(esp.el.positiveA).toBeCloseTo(0.7, 12);
    expect(esp.el.negativeA).toBeCloseTo(0.3, 12);
    expect(esp.el.driveA).toBeCloseTo(0.4, 12);
    expect(esp.el.stateA).toBe('negative');
    esp.cleanup();
  });

  it('turns ENA PWM duty into bridge fractions without edges', () => {
    const nrf = attach('nrf52840-dk', { ENA: 'P1.12', IN1: 'P1.13', IN2: 'P1.14' });
    for (const pin of [44, 45, 46]) nrf.dir(pin, 1, 1);
    nrf.level(45, 1, 2);
    nrf.pwm(44, 0.25, 1000, 10);
    nrf.park(210);
    expect(nrf.el.positiveA).toBeCloseTo(0.25, 9);
    expect(nrf.el.coastA).toBeCloseTo(0.75, 9);
    expect(nrf.el.driveA).toBeCloseTo(0.25, 9);
    expect(nrf.el.stateA).toBe('positive');
    nrf.park(210.5);
    expect(nrf.el.stateA).toBe('coast');
    nrf.pwm(44, 0.75, 1000, 260.2);
    nrf.park(310);
    expect(nrf.el.positiveA).toBeCloseTo(0.5 * 0.25 + 0.5 * 0.75, 2);
    nrf.park(400);
    expect(nrf.el.positiveA).toBeCloseTo(0.75, 9);
    nrf.pwm(44, 0, 0, 450);
    nrf.park(560);
    expect(nrf.el.coastA).toBe(1);
    nrf.cleanup();
  });

  it('takes the PWM on a direction input: IN1 PWM against IN2 LOW is positive / brake', () => {
    const esp = attach('esp32-s3', { ENA: '4', IN1: '5', IN2: '6' });
    for (const pin of [4, 5, 6]) esp.dir(pin, 1, 1);
    esp.level(4, 1, 2);
    esp.pwm(5, 0.4, 20_000, 5);
    esp.park(105);
    expect(esp.el.positiveA).toBeCloseTo(0.4, 9);
    expect(esp.el.brakeLowA).toBeCloseTo(0.6, 9);
    esp.cleanup();
  });

  it('rejects two PWM inputs on one bridge, a PWM enable against its jumper, and probed PWM outputs', () => {
    const two = attach('esp32-s3', { ENA: '4', IN1: '5', IN2: '6' });
    for (const pin of [4, 5, 6]) two.dir(pin, 1, 1);
    two.pwm(4, 0.5, 1000, 2);
    expect(() => two.pwm(5, 0.5, 1000, 3)).toThrow('more than one PWM input');
    two.cleanup();

    const jumpered = attach('esp32-s3', { ENA: '4', IN1: '5', IN2: '6' });
    jumpered.dir(4, 1, 1);
    jumpered.pwm(4, 0.5, 1000, 2);
    expect(() => dispatchSensorUpdate('driver', { enaJumper: true })).toThrow('contends');
    jumpered.cleanup();

    const probed = attach('esp32-s3', { ENA: '4', IN1: '5', IN2: '6', OUT1: '7' });
    for (const pin of [4, 5, 6]) probed.dir(pin, 1, 1);
    expect(() => probed.pwm(4, 0.5, 1000, 2)).toThrow('DC probes cannot read the waveform');
    probed.cleanup();
  });

  it('limits a nominal output probe to the 3.3 V MCU supply', () => {
    const esp = attach('esp32-s3', { ENA: '4', IN1: '5', IN2: '6', OUT1: '7' });
    for (const pin of [4, 5, 6]) esp.dir(pin, 1, 1);
    esp.level(4, 1, 2);
    expect(() => esp.level(5, 1, 3)).toThrow('nominal 3.3V MCU probe supply');
    esp.cleanup();
  });
});

describe('line sensor on a bridge board 3.3 V rail', () => {
  afterEach(() => {
    useSimulatorStore.setState({ wires: [], components: [], boards: [] });
    useElectricalStore.getState().reset();
  });

  function attach(kind: BoardKind, supply: string, outputs: string[]) {
    useSimulatorStore.setState({ boards: [{ id: 'board', boardKind: kind }] as any, components: [{ id: 'sensor', metadataId: 'line-sensor' }] as any,
      wires: [wire('sensor', 'VCC', 'board', supply), wire('sensor', 'GND', 'board', 'GND.1'), ...['L', 'M', 'R'].map((pin, i) => wire('sensor', pin, 'board', outputs[i]))] as any });
    const board = bridgeBoard(kind);
    const el = document.createElement('velxio-line-sensor') as HTMLElement & Record<string, any>;
    const cleanup = PartSimulationRegistry.get('line-sensor')!.attachEvents!(el, board.sim as any, () => null, 'sensor');
    return { ...board, el, cleanup };
  }

  it('drives ESP32-S3 inputs LOW, and rejects its LM324 HIGH, which stays between VIL and VIH', () => {
    const esp = attach('esp32-s3', '3V3.1', ['12', '13', '14']);
    expect(esp.el.supplyVoltage).toBe(3.3);
    expect(esp.gpioIn()).toEqual([[12, 0], [13, 0], [14, 0]]);
    esp.ws.receive({ type: 'gpio_pull', data: { pin: 13, pull: 1 } });
    expect(esp.el.middleVoltage).toBeLessThan(0.8);
    expect(() => dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 100 })).toThrow(/GPIO 12: part drives resolve to 2\.\d\d V, between VIL/);
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 200 });
    expect(() => dispatchSensorUpdate('sensor', { rightPhotocurrentUa: 300 })).toThrow('saturation');
    esp.cleanup();
    expect(esp.drives.hasExternalPinDrive(12)).toBe(false);
  });

  it('takes nRF52840 pulls from the MCU: a pulldown loads the output, the 13 kΩ pullup exceeds it', () => {
    const nrf = attach('nrf52840-dk', 'VDD', ['P1.10', 'P1.11', 'P1.12']);
    expect(nrf.el.supplyVoltage).toBe(3.3);
    expect(nrf.gpioIn()).toEqual([[42, 0], [43, 0], [44, 0]]);
    nrf.dir(43, 0, 1, 2);
    expect(nrf.el.middleVoltage).toBeLessThan(0.8);
    expect(() => nrf.dir(42, 0, 2, 1)).toThrow('aggregate output loading');
    nrf.cleanup();
  });

  it('fails a graded run with a solved supply outside the model', async () => {
    const esp = attach('esp32-s3', '3V3.1', ['12', '13', '14']);
    esp.bridge.gradingMode = true;
    expect(() => useElectricalStore.setState({ pinNetMap: new Map([['sensor:VCC', 'supply'], ['sensor:GND', '0']]), nodeVoltages: { supply: 2.9 },
      solvedComponents: [{ id: 'sensor', properties: {} }] as any })).toThrow('3.0..5.1');
    await expect(esp.bridge.sync()).rejects.toThrow(`${REJECTED}: line-sensor: nominal model requires 3.0..5.1V`);
    esp.cleanup();
  });
});

describe('line sensor behind a level shifter on a bridge board', () => {
  afterEach(() => {
    useSimulatorStore.setState({ wires: [], components: [], boards: [] });
    useElectricalStore.getState().reset();
  });

  const targets = [
    { kind: 'esp32-s3' as const, lv: '3V3.1', pins: ['12', '13', '14'], gpios: [12, 13, 14] },
    { kind: 'nrf52840-dk' as const, lv: 'VDD', pins: ['P1.10', 'P1.11', 'P1.12'], gpios: [42, 43, 44] },
  ];
  type Target = typeof targets[number];

  // Sensor VCC and shifter HV on board 5V, shifter LV on `lv`; L/M/R → HV1..3, LV1..3 → GPIOs.
  function attach(target: Target, { lv = target.lv, extra = [] as ReturnType<typeof wire>[] } = {}) {
    useSimulatorStore.setState({
      boards: [{ id: 'board', boardKind: target.kind }] as any,
      components: [{ id: 'sensor', metadataId: 'line-sensor' }, { id: 'ls', metadataId: 'level-shifter' }] as any,
      wires: [
        wire('sensor', 'VCC', 'board', '5V'), wire('sensor', 'GND', 'board', 'GND.1'),
        wire('ls', 'HV', 'board', '5V'), wire('ls', 'LV', 'board', lv), wire('ls', 'GND.1', 'board', 'GND.1'),
        ...['L', 'M', 'R'].map((pin, i) => wire('sensor', pin, 'ls', `HV${i + 1}`)),
        ...target.pins.map((pin, i) => wire('ls', `LV${i + 1}`, 'board', pin)),
        ...extra,
      ] as any,
    });
    const board = bridgeBoard(target.kind);
    const el = document.createElement('velxio-line-sensor') as HTMLElement & Record<string, any>;
    const cleanup = PartSimulationRegistry.get('line-sensor')!.attachEvents!(el, board.sim as any, () => null, 'sensor');
    const pull = (gpio: number, value: 0 | 1 | 2) => target.kind === 'esp32-s3'
      ? board.ws.receive({ type: 'gpio_pull', data: { pin: gpio, pull: value } })
      : board.dir(gpio, 0, 1, value);
    return { ...board, el, cleanup, pull };
  }

  it.each(targets)('runs from 5 V and leaves $kind GPIOs to the solved shifter', (target) => {
    const board = attach(target);
    dispatchSensorUpdate('sensor', { middlePhotocurrentUa: 300 });
    expect(board.el.supplyVoltage).toBe(5);
    expect(Math.abs(board.el.leftVoltage - 4.6)).toBeLessThan(0.005);
    const low = board.el.middleVoltage;
    expect(low).toBeGreaterThan(0.62);
    expect(low).toBeLessThan(0.64);
    board.pull(target.gpios[1], 1);
    expect(board.el.middleVoltage - low).toBeGreaterThan(0);
    expect(board.el.middleVoltage - low).toBeLessThan(0.002);
    for (const gpio of target.gpios) expect(board.drives.hasExternalPinDrive(gpio)).toBe(false);
    expect(board.gpioIn()).toEqual([]);
    expect(() => board.pull(target.gpios[0], 2)).toThrow('must remain an input without pull-down');
    board.cleanup();
  });

  it.each(targets)('rejects $kind wiring outside the shifted-output rules', (target) => {
    expect(() => attach(target, { extra: [wire('sensor', 'L', 'board', target.pins[0])] })).toThrow('L must wire directly to one level-shifter HV1..HV4 pin and nothing else');
    expect(() => attach(target, { extra: [wire('sensor', 'M', 'ls', 'LV4')] })).toThrow('M must wire directly to one level-shifter HV1..HV4 pin');
    expect(() => attach(target, { lv: '5V' })).toThrow('unsupported supply topology');
    expect(() => attach(target, { extra: [wire('ls', 'LV1', 'board', 'GND.2')] })).toThrow('level-shifter LV1 supports only MCU inputs');
    const other = target.kind === 'esp32-s3' ? '15' : 'P1.13';
    expect(() => attach(target, { extra: [wire('ls', 'LV3', 'board', other)] })).toThrow('each output supports one MCU input');
  });
});
