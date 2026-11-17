// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Mpr121Element } from '../../elements/Mpr121Element';
import { mpr121Address, mpr121Powered } from '../../sim/Mpr121';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { getPhysicalPinDrives } from '@velxio/simulation/PhysicalPinDrives';
import { I2CBusManager, nullI2CMaster } from '@velxio/simulation/I2CBusManager';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { loadPythonModels, type LocalPartPins } from '@velxio/simulation/python/PythonModels';
import { invokeDoVerb } from '../../../harness/do_verbs';

vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', vi.fn());
const wire = (a: string, ap: string, b: string, bp: string) => ({ id: `${a}:${ap}:${b}:${bp}`, start: { componentId: a, pinName: ap, x: 0, y: 0 }, end: { componentId: b, pinName: bp, x: 0, y: 0 } }) as any;
const power = [wire('sensor', 'VIN', 'board', '5V'), wire('sensor', 'GND', 'board', 'GND')];
const board = { id: 'board', boardKind: 'arduino-mega' } as any;
beforeAll(() => loadPythonModels());
afterEach(() => useSimulatorStore.setState({ wires: [], components: [], boards: [] }));

describe('MPR121 physical element and attachment', () => {
  it('matches all 19 canonical QT pads and records the second physical ground contact without a new signal', () => {
    const el = document.createElement('velxio-mpr121') as Mpr121Element;
    expect(el.shadowRoot!.querySelector('svg')!.getAttribute('width')).toBe('124.8');
    expect(el.shadowRoot!.querySelector('svg')!.getAttribute('height')).toBe('72.48');
    expect(el.pinInfo).toHaveLength(19); expect(el.pinInfo.find((pin) => pin.name === 'GND')).toMatchObject({ x: 52.8, y: 62.4 });
    expect(el.equivalentPads).toEqual([{ name: 'GND', x: 120, y: 4.8 }]);
    for (let i = 0; i < 12; i++) {
      const pin = el.pinInfo.find((pin) => pin.name === String(i))!;
      expect(pin.x).toBeCloseTo(110.4 - i * 9.6); expect(pin.y).toBe(4.8);
    }
  });
  it('pointer/keyboard UI and harness call the same real keyed handlers and touch-change event', () => {
    const el = document.createElement('velxio-mpr121') as Mpr121Element; const events: unknown[] = [];
    el.addEventListener('touch-change', (event) => events.push((event as CustomEvent).detail));
    invokeDoVerb(el, { role: 'touch', key: '0', verb: 'down' });
    el.shadowRoot!.querySelector('[data-key="0"]')!.dispatchEvent(new Event('pointerup'));
    el.shadowRoot!.querySelector('[data-key="11"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    invokeDoVerb(el, { role: 'touch', key: '11', verb: 'up' });
    expect(events).toEqual([{ electrode: 0, pressed: true }, { electrode: 0, pressed: false }, { electrode: 11, pressed: true }, { electrode: 11, pressed: false }]);
    expect(() => el.down('12')).toThrow('unknown electrode'); expect(() => el.up('0')).toThrow('already up');
  });
  it.each([['GND', 0x5a], ['3Vo', 0x5b], ['SDA', 0x5c], ['SCL', 0x5d]] as const)('ADDR strap to %s is stable net identity', (pin, address) => {
    useSimulatorStore.setState({ wires: [{ id: 'strap', start: { componentId: 'sensor', pinName: 'ADDR', x: 0, y: 0 }, end: { componentId: 'sensor', pinName: pin, x: 0, y: 0 } } as any] });
    expect(mpr121Address('sensor', undefined)).toBe(address); expect(mpr121Address('sensor', address)).toBe(address);
    expect(() => mpr121Address('sensor', address === 0x5a ? 0x5b : 0x5a)).toThrow('conflicts');
  });
  it('rejects invalid ADDR topologies and undocumented property values', () => {
    useSimulatorStore.setState({ wires: [{ id: 'strap', start: { componentId: 'sensor', pinName: 'ADDR', x: 0, y: 0 }, end: { componentId: 'sensor', pinName: 'VIN', x: 0, y: 0 } } as any] });
    expect(() => mpr121Address('sensor', undefined)).toThrow('ADDR must');
    useSimulatorStore.setState({ wires: [] }); expect(mpr121Address('sensor', undefined)).toBe(0x5a);
    expect(() => mpr121Address('sensor', 'auto')).toThrow('address must');
  });
  it('registers physical inputs with the Python model, hands it its INT network and the CPU clock, validates updates atomically and removes only its own drives', () => {
    const el = document.createElement('velxio-mpr121') as Mpr121Element;
    const drives = new Map<string, unknown>(); const listeners = new Map<number, () => void>();
    const sim = { cpuInitialized: true, scheduleClockEvent: vi.fn(),
      setExternalPinDrive: (_pin: number, owner: string, drive: unknown) => drives.set(owner, drive),
      removeExternalPinDrive: (_pin: number, owner: string) => drives.delete(owner),
      onResolvedPinVoltage: (gpio: number, cb: () => void) => { listeners.set(gpio, cb); return () => listeners.delete(gpio); },
      getResolvedPinVoltage: () => 3.3,
      registerSensor: vi.fn((_type: string, _pin: number, _props: Record<string, unknown>, _pins: LocalPartPins) => true),
      updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    useSimulatorStore.setState({ boards: [board], wires: [...power, wire('sensor', 'INT', 'board', '2')] });
    drives.set('other-device', { voltage: 0, resistance: 10000 });
    const cleanup = PartSimulationRegistry.get('mpr121')!.attachEvents!(el, sim as any, (pin) => pin === 'INT' ? 2 : null, 'sensor');
    const [type, pin, props, pins] = sim.registerSensor.mock.calls[0];
    expect([type, pin]).toEqual(['mpr121', 200 + 0x5a]);
    expect(props).toEqual({ addr: 0x5a, powered: true, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`capacitance${i}`, 15])),
      rextOvercurrent: false, pressed: Array(12).fill(false) });
    expect(getPhysicalPinDrives('sensor')).toEqual([{ pin: '3Vo', owner: 'regulator', drive: { voltage: 3.3, resistance: 0.1 } },
      { pin: 'INT', owner: 'pull', drive: { voltage: 3.3, resistance: 10000 } }]);
    expect(drives.get('sensor:INT:network')).toEqual({ voltage: 3.3, resistance: 10000 });
    pins.drive('INT', { voltage: 0, resistance: 50 });
    expect(getPhysicalPinDrives('sensor').filter(({ pin }) => pin === 'INT')).toHaveLength(2);
    const asserted = drives.get('sensor:INT:network') as { voltage: number; resistance: number };
    expect(asserted.voltage).toBeCloseTo(3.3 * 50 / 10050, 6); expect(asserted.resistance).toBeCloseTo(50 * 10000 / 10050, 6);
    expect(pins.voltage('INT')).toBe(3.3);
    const changed = vi.fn(); const unwatch = pins.watch(changed);
    listeners.get(2)!(); expect(sim.scheduleClockEvent).toHaveBeenCalledWith(changed, 1);
    unwatch(); expect(listeners.size).toBe(0);
    dispatchSensorUpdate('sensor', { capacitance11: 30 }); expect(el.capacitance11).toBe(30);
    expect(sim.updateSensor).toHaveBeenLastCalledWith(200 + 0x5a, { capacitance11: 30 });
    expect(() => dispatchSensorUpdate('sensor', { capacitance11: 20, rextOvercurrent: 'true' } as any)).toThrow('boolean'); expect(el.capacitance11).toBe(30);
    expect(() => dispatchSensorUpdate('sensor', { capacitance0: 0 })).toThrow('excluding zero');
    expect(() => dispatchSensorUpdate('sensor', { touchMask: 1 })).toThrow('unknown physical');
    expect(sim.updateSensor).toHaveBeenCalledTimes(1);
    invokeDoVerb(el, { role: 'touch', key: '3', verb: 'down' });
    expect(sim.updateSensor).toHaveBeenLastCalledWith(200 + 0x5a, { pressed: [false, false, false, true, ...Array(8).fill(false)] });
    cleanup(); expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x5a);
    expect(hasSensorUpdateHandler('sensor')).toBe(false); expect(getPhysicalPinDrives('sensor')).toHaveLength(0);
    expect([...drives.keys()]).toEqual(['other-device']);
    invokeDoVerb(el, { role: 'touch', key: '3', verb: 'up' }); expect(sim.updateSensor).toHaveBeenCalledTimes(2);
  });
  it('releases its drives and stays inert when the AVR declines the registration', () => {
    const drives = new Map<string, unknown>();
    const sim = { cpuInitialized: true, setExternalPinDrive: (_pin: number, owner: string, drive: unknown) => drives.set(owner, drive),
      removeExternalPinDrive: (_pin: number, owner: string) => drives.delete(owner),
      registerSensor: vi.fn(() => false), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    useSimulatorStore.setState({ boards: [board], wires: [...power, wire('sensor', 'INT', 'board', '2')] });
    const el = document.createElement('velxio-mpr121') as Mpr121Element;
    const cleanup = PartSimulationRegistry.get('mpr121')!.attachEvents!(el, sim as any, (pin) => pin === 'INT' ? 2 : null, 'sensor');
    expect(sim.registerSensor).toHaveBeenCalledOnce();
    expect(drives.size).toBe(0); expect(getPhysicalPinDrives('sensor')).toHaveLength(0); expect(hasSensorUpdateHandler('sensor')).toBe(false);
    invokeDoVerb(el, { role: 'touch', key: '0', verb: 'down' }); expect(sim.updateSensor).not.toHaveBeenCalled();
    cleanup(); expect(sim.unregisterSensor).not.toHaveBeenCalled();
  });
  it('requires real VIN and GND and leaves an unpowered part without a regulator or IRQ source', () => {
    useSimulatorStore.setState({ boards: [board], wires: [] }); expect(mpr121Powered('sensor')).toBe(false);
    useSimulatorStore.setState({ wires: power }); expect(mpr121Powered('sensor')).toBe(true);
    useSimulatorStore.setState({ wires: [wire('sensor', 'VIN', 'board', '22'), power[1]] });
    expect(() => mpr121Powered('sensor')).toThrow('supported 3..5V');
    useSimulatorStore.setState({ wires: [...power, wire('sensor', 'GND', 'board', '5V')] });
    expect(() => mpr121Powered('sensor')).toThrow('only direct board ground');
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    useSimulatorStore.setState({ wires: [wire('sensor', 'INT', 'board', '2')] });
    const cleanup = PartSimulationRegistry.get('mpr121')!.attachEvents!(document.createElement('velxio-mpr121'), sim, (pin) => pin === 'INT' ? 2 : null, 'sensor');
    expect(getPhysicalPinDrives('sensor').every((entry) => entry.drive === null)).toBe(true);
    const device = sim.getI2CDevice(0x5a)!;
    expect(device.acknowledgeAddress!(true)).toBe(false); expect(device.writeByte(0x80)).toBe(false);
    cleanup(); sim.stop();
  });
  it('accepts shared relay and MPR121 supply inputs but rejects unsupported or conflicting supply connections', () => {
    useSimulatorStore.setState({ boards: [board], components: [
      { id: 'relay', metadataId: 'relay-module' }, { id: 'other', metadataId: 'mpr121' },
      { id: 'source', metadataId: 'power-supply' },
    ] as any, wires: [...power, wire('relay', 'VCC', 'board', '5V'), wire('relay', 'GND', 'board', 'GND'),
      wire('other', 'VIN', 'board', '5V'), wire('other', 'GND', 'board', 'GND')] });
    expect(mpr121Powered('sensor')).toBe(true);
    for (const [part, pin] of [['relay', 'IN'], ['relay', 'NO'], ['other', '3Vo'], ['source', '+'], ['board', 'A0']] as const) {
      useSimulatorStore.setState({ wires: [...power, wire(part, pin, 'board', '5V')] });
      expect(() => mpr121Powered('sensor')).toThrow('supported 3..5V');
    }
    useSimulatorStore.setState({ wires: [...power, wire('sensor', 'VIN', 'board', '3V3')] });
    expect(() => mpr121Powered('sensor')).toThrow('supported 3..5V');
    for (const [part, pin] of [['relay', 'IN'], ['relay', 'NC'], ['other', '3Vo'], ['source', '-'], ['board', 'A0']] as const) {
      useSimulatorStore.setState({ wires: [...power, wire(part, pin, 'board', 'GND')] });
      expect(() => mpr121Powered('sensor')).toThrow('only direct board ground');
    }
  });
  it.each([['22', 22], ['A0', 54]] as const)('projects pad loading through a series resistor to %s without double-counting the MCU branch', (label, gpio) => {
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    useSimulatorStore.setState({ boards: [board], components: [
      { id: 'series', metadataId: 'resistor', properties: { value: '10k' } },
      { id: 'pull', metadataId: 'resistor', properties: { value: '10k' } },
    ] as any, wires: [...power, wire('sensor', '4', 'series', '1'), wire('series', '2', 'board', label),
      wire('sensor', '4', 'pull', '1'), wire('pull', '2', 'board', 'GND')] });
    const cleanup = PartSimulationRegistry.get('mpr121')!.attachEvents!(document.createElement('velxio-mpr121'), sim, (pin) => pin === '4' ? gpio : null, 'sensor');
    const device = sim.getI2CDevice(0x5a)!;
    const write = (register: number, value: number) => {
      expect(device.acknowledgeAddress!(true)).toBe(true); device.writeByte(register); device.writeByte(value); device.stop!();
    };
    write(0x76, 1); write(0x75, 1); write(0x77, 1);
    expect(sim.getResolvedPinVoltage(gpio)).toBeCloseTo(3.3 * 10000 / 10050, 5);
    expect(sim.getResolvedPinState(gpio).state).toBe('high'); cleanup(); sim.stop();
  });

  it('shares breadboard strips with the canonical network and rejects conflicting ADDR rails', () => {
    useSimulatorStore.setState({ boards: [board], components: [{ id: 'bb', metadataId: 'breadboard' }] as any,
      wires: [wire('sensor', 'VIN', 'bb', '1t.a'), wire('board', '5V', 'bb', '1t.e'), power[1],
        wire('sensor', 'ADDR', 'bb', '2t.a'), wire('sensor', '3Vo', 'bb', '2t.e')] });
    expect(mpr121Powered('sensor')).toBe(true); expect(mpr121Address('sensor', undefined)).toBe(0x5b);
    useSimulatorStore.setState({ wires: [wire('sensor', 'ADDR', 'sensor', '3Vo'), wire('sensor', 'ADDR', 'sensor', 'GND')] });
    expect(() => mpr121Address('sensor', undefined)).toThrow('ADDR must');
  });

  it('ADDR selects the SDA net identity with a passive bus pull-up, independently of bus voltage', () => {
    useSimulatorStore.setState({ boards: [board], components: [{ id: 'pull', metadataId: 'resistor', properties: { value: '10k' } }] as any,
      wires: [wire('sensor', 'ADDR', 'sensor', 'SDA'), wire('sensor', 'SDA', 'board', '20'), wire('sensor', 'SDA', 'pull', '1'), wire('pull', '2', 'board', '3V3')] });
    expect(mpr121Address('sensor', undefined)).toBe(0x5c);
  });

  it('does not invent a ground or regulator when VIN is present but GND floats through the IRQ net', () => {
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    useSimulatorStore.setState({ boards: [board], components: [], wires: [power[0], wire('sensor', 'INT', 'board', '2'), wire('sensor', 'INT', 'sensor', 'GND')] });
    const cleanup = PartSimulationRegistry.get('mpr121')!.attachEvents!(document.createElement('velxio-mpr121'), sim, (pin) => pin === 'INT' ? 2 : null, 'sensor');
    expect(sim.getResolvedPinState(2).state).toBe('floating'); expect(getPhysicalPinDrives('sensor').every((entry) => entry.drive === null)).toBe(true);
    cleanup(); sim.stop();
  });

  const bridgeSim = () => {
    const release = vi.fn();
    return { release, sim: { registerSensor: vi.fn(() => true), updateSensor: vi.fn(), unregisterSensor: vi.fn(),
      getBridge: () => ({ drivePartPins: vi.fn(() => release) }) } };
  };
  const esp = { id: 'esp', boardKind: 'esp32-s3' } as any;
  const espPower = [wire('sensor', 'VIN', 'esp', '3V3.1'), wire('sensor', 'GND', 'esp', 'GND.1')];

  it('registers with the worker at 200 + strap address, splitting MCU-bound electrodes from canvas ones', () => {
    useSimulatorStore.setState({ boards: [esp], components: [
      { id: 'series', metadataId: 'resistor', properties: { value: '10k' } },
      { id: 'pull', metadataId: 'resistor', properties: { value: '100k' } },
      { id: 'led', metadataId: 'led' },
    ] as any, wires: [...espPower, wire('sensor', 'ADDR', 'sensor', 'SCL'), wire('sensor', 'SCL', 'esp', '39'),
      wire('sensor', 'INT', 'esp', '4'), wire('sensor', '4', 'series', '1'), wire('series', '2', 'esp', '5'),
      wire('sensor', '4', 'pull', '1'), wire('pull', '2', 'esp', 'GND.2'), wire('sensor', '5', 'esp', '6'), wire('sensor', '11', 'led', 'A')] });
    const el = document.createElement('velxio-mpr121') as Mpr121Element;
    const { sim, release } = bridgeSim();
    const gpios: Record<string, number> = { INT: 4, '4': 5, '5': 6 };
    const cleanup = PartSimulationRegistry.get('mpr121')!.attachEvents!(el, sim as any, (pin) => gpios[pin] ?? null, 'sensor');
    const [type, pin, props] = (sim.registerSensor.mock.calls[0] as unknown) as [string, number, Record<string, any>];
    expect([type, pin]).toEqual(['mpr121', 200 + 0x5d]);
    expect(props).toMatchObject({ addr: 0x5d, powered: true, int_pin: 4, e4_pin: 5, e5_pin: 6, capacitance0: 15, rextOvercurrent: false, pressed: Array(12).fill(false) });
    expect(props).not.toHaveProperty('e6_pin');
    expect(props.electrodes['4']).toMatchObject({ series: 10000, load: { voltage: 0 }, parts: false });
    expect(props.electrodes['4'].load.resistance).toBeCloseTo(100000, 6);
    expect(props.electrodes['5']).toEqual({ series: 0, load: null, parts: false });
    expect(props.electrodes['11']).toEqual({ series: null, load: null, parts: true });
    expect(getPhysicalPinDrives('sensor')).toEqual([{ pin: '3Vo', owner: 'regulator', drive: { voltage: 3.3, resistance: 0.1 } }]);
    invokeDoVerb(el, { role: 'touch', key: '3', verb: 'down' });
    expect(sim.updateSensor).toHaveBeenLastCalledWith(200 + 0x5d, { pressed: [false, false, false, true, ...Array(8).fill(false)] });
    dispatchSensorUpdate('sensor', { capacitance2: 40 }); expect(sim.updateSensor).toHaveBeenLastCalledWith(200 + 0x5d, { capacitance2: 40 });
    expect(() => dispatchSensorUpdate('sensor', { capacitance2: 0 })).toThrow('excluding zero');
    expect(sim.updateSensor).toHaveBeenCalledTimes(2);
    cleanup();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + 0x5d); expect(release).toHaveBeenCalled();
    expect(hasSensorUpdateHandler('sensor')).toBe(false); expect(getPhysicalPinDrives('sensor')).toHaveLength(0);
  });

  it('takes the nRF52840 DK VDD rail as a 3.3 V supply', () => {
    useSimulatorStore.setState({ boards: [{ id: 'dk', boardKind: 'nrf52840-dk' } as any],
      wires: [wire('sensor', 'VIN', 'dk', 'VDD'), wire('sensor', 'GND', 'dk', 'GND.1')] });
    expect(mpr121Powered('sensor')).toBe(true);
  });

  it('pulls a canvas INT up itself and rejects an MCU-bound electrode that shares its net with other parts', () => {
    useSimulatorStore.setState({ boards: [esp], components: [{ id: 'led', metadataId: 'led' }] as any, wires: espPower });
    const { sim } = bridgeSim();
    PartSimulationRegistry.get('mpr121')!.attachEvents!(document.createElement('velxio-mpr121'), sim as any, () => null, 'sensor')();
    expect(((sim.registerSensor.mock.calls[0] as unknown) as [string, number, Record<string, unknown>])[2]).not.toHaveProperty('int_pin');
    useSimulatorStore.setState({ wires: [...espPower, wire('sensor', '6', 'esp', '7'), wire('sensor', '6', 'led', 'A')] });
    const rejecting = bridgeSim().sim;
    expect(() => PartSimulationRegistry.get('mpr121')!.attachEvents!(document.createElement('velxio-mpr121'), rejecting as any,
      (pin) => pin === '6' ? 7 : null, 'sensor')).toThrow('only with rail resistors');
    expect(rejecting.registerSensor).not.toHaveBeenCalled();
  });

  it('honors the real device power ACK for local and bridged address transactions', () => {
    const completeConnect = vi.fn(); const bus = new I2CBusManager({ ...nullI2CMaster(), completeConnect });
    const sims: AVRSimulator[] = []; const cleanups: Array<() => void> = [];
    const device = (powered: boolean) => {
      useSimulatorStore.setState({ boards: [board], wires: powered ? power : [] });
      const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n'); sims.push(sim);
      cleanups.push(PartSimulationRegistry.get('mpr121')!.attachEvents!(document.createElement('velxio-mpr121'), sim, () => null, 'sensor'));
      return sim.getI2CDevice(0x5a)!;
    };
    bus.addDevice(device(true)); bus.connectToSlave(0x5a, true); expect(completeConnect).toHaveBeenLastCalledWith(true);
    expect(bus.handleExternalConnect(0x5a, false, new Set())).toBe(true); expect(bus.isHandlingExternal()).toBe(true);
    bus.removeDevice(0x5a); cleanups.pop()!(); bus.addDevice(device(false)); bus.connectToSlave(0x5a, true); expect(completeConnect).toHaveBeenLastCalledWith(false);
    expect(bus.handleExternalConnect(0x5a, false, new Set())).toBe(false); expect(bus.isHandlingExternal()).toBe(false);
    cleanups.forEach((cleanup) => cleanup()); sims.forEach((sim) => sim.stop());
  });

});
