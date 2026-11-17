// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { L298nElement } from '../../elements/L298nElement';
import { l298nBridge, l298nLogic, l298nSupply, L298nMeasurements } from '../../sim/L298n';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { getPhysicalPinDrives } from '@velxio/simulation/PhysicalPinDrives';
import { dispatchSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';

vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', vi.fn());
const wire = (a: string, ap: string, b: string, bp: string) => ({ id: `${a}:${ap}:${b}:${bp}`, start: { componentId: a, pinName: ap, x: 0, y: 0 }, end: { componentId: b, pinName: bp, x: 0, y: 0 } });
const jumpers = { regulatorJumper: true, enaJumper: false, enbJumper: false };
const power = [wire('driver', '+12V', 'battery', '+'), wire('battery', '−', 'board', 'GND'), wire('driver', 'GND', 'board', 'GND')];
function circuit(extra: ReturnType<typeof wire>[] = []) {
  useSimulatorStore.setState({ boards: [{ id: 'board', boardKind: 'arduino-mega' }] as any,
    components: [{ id: 'driver', metadataId: 'l298n' }, { id: 'battery', metadataId: 'battery-9v' }] as any, wires: [...power, ...extra] });
}
afterEach(() => useSimulatorStore.setState({ wires: [], components: [], boards: [] }));

describe('L298N independent truth and CPU measurements', () => {
  it.each(Array.from({ length: 8 }, (_, code) => [code, ['coast', 'coast', 'coast', 'coast', 'brakeLow', 'negative', 'positive', 'brakeHigh'][code]]))('evaluates truth case %i on either bridge', (code, state) => {
    const bits = Number(code);
    expect(l298nBridge(Boolean(bits & 4), Boolean(bits & 2), Boolean(bits & 1))).toBe(state);
  });
  it('does not substitute LOW or hysteresis for floating and undefined TTL inputs', () => {
    expect(l298nLogic(null, 5)).toBeNull(); expect(l298nLogic(1.5, 5)).toBe(false); expect(l298nLogic(2.3, 5)).toBe(true);
    expect(l298nLogic(2, 5)).toBeNull(); expect(l298nBridge(false, null, null)).toBe('coast');
    expect(l298nBridge(true, null, false)).toBe('unknown'); expect(() => l298nLogic(6, 5)).toThrow('outside');
  });
  it('integrates all five states over a sliding CPU-time window without metadata duty', () => {
    let cycles = 0; const measurement = new L298nMeasurements(() => cycles, 1000, 100);
    measurement.update('positive'); cycles = 20; measurement.update('negative'); cycles = 40; measurement.update('brakeHigh');
    cycles = 60; measurement.update('brakeLow'); cycles = 80; measurement.update('coast'); cycles = 100;
    expect(measurement.fractions()).toEqual({ positive: 0.2, negative: 0.2, brakeHigh: 0.2, brakeLow: 0.2, coast: 0.2 });
    cycles = 180; expect(measurement.fractions().coast).toBe(1);
    expect(() => new L298nMeasurements(() => 0, 1000, 0)).toThrow('sampleWindowMs');
  });
  it('rejects observation of unknown windows and backward clocks', () => {
    let cycles = 0; const measurement = new L298nMeasurements(() => cycles, 1000, 100);
    expect(() => measurement.state).toThrow('unresolved'); cycles = 10; expect(() => measurement.fractions()).toThrow('unresolved');
    measurement.update('positive'); cycles = 110; expect(measurement.fractions().positive).toBe(1);
    cycles = 0; expect(() => measurement.update('coast')).toThrow('backwards');
  });
  it('preserves battery ESR and actual logic/regulator domains', () => {
    circuit(); expect(l298nSupply('driver', jumpers)).toEqual({ motor: { voltage: 9, resistance: 1.5 }, logic: { voltage: 5, resistance: 0.01 } });
    expect(l298nSupply('driver', { ...jumpers, regulatorJumper: false }).logic).toBeNull();
    circuit([wire('driver', '+5V', 'board', '5V')]); expect(() => l298nSupply('driver', jumpers)).toThrow('conflicts');
    expect(l298nSupply('driver', { ...jumpers, regulatorJumper: false }).logic?.voltage).toBe(5);
    useSimulatorStore.setState({ wires: [power[0], power[2]] }); expect(() => l298nSupply('driver', jumpers)).toThrow('common');
  });
  it.each([5, 6, 12, 13, 35, 36])('validates %i V module and conservative regulator limits', (voltage) => {
    circuit(); useSimulatorStore.setState({ components: [{ id: 'supply', metadataId: 'power-supply', properties: { mode: 'dc', voltage, currentLimit: 2 } }] as any,
      wires: [wire('driver', '+12V', 'supply', 'SIG'), wire('supply', 'GND', 'board', 'GND'), power[2]] });
    if (voltage > 35) expect(() => l298nSupply('driver', { ...jumpers, regulatorJumper: false })).toThrow('5..35');
    else { const supply = l298nSupply('driver', { ...jumpers, regulatorJumper: false }); expect(supply.motor?.resistance).toBe(voltage / 3); }
    if (voltage < 6 || voltage > 12) expect(() => l298nSupply('driver', jumpers)).toThrow();
    else expect(l298nSupply('driver', jumpers).logic?.voltage).toBe(5);
  });
  it('renders canonical pads and the three actual jumper settings', () => {
    const el = document.createElement('velxio-l298n') as L298nElement;
    expect(el.pinInfo).toHaveLength(13); expect(el.pinInfo.map((pin) => pin.name)).toEqual(['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB', '+12V', 'GND', '+5V', 'OUT1', 'OUT2', 'OUT3', 'OUT4']);
    expect(el.pinInfo.find((pin) => pin.name === 'OUT4')).toMatchObject({ x: 148.8, y: 101.6 });
    el.enaJumper = false; expect((el.shadowRoot!.querySelector('[data-jumper="enaJumper"]') as SVGElement).style.display).toBe('none');
  });
  it('attaches real MCU nets, distinguishes released outputs from brakes, and cleans its contributors', () => {
    const names = ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB']; const pins = [7, 5, 6, 8, 9, 10];
    circuit(names.map((pin, index) => wire('driver', pin, 'board', String(pins[index]))));
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    const el = document.createElement('velxio-l298n') as L298nElement; Object.assign(el, jumpers);
    const cleanup = PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, (pin) => pins[names.indexOf(pin)] ?? null, 'driver');
    expect(() => (el as any).stateA).toThrow('unresolved');
    const cpu = (sim as any).cpu; cpu.writeData(0x101, 0x78); cpu.writeData(0x102, 0x18); cpu.writeData(0x2d, 0x08); cpu.writeData(0x2e, 0); cpu.writeData(0x24, 0x10); cpu.writeData(0x25, 0x10);
    cpu.cycles += 10; cpu.tick();
    expect((el as any).stateA).toBe('negative'); expect((el as any).stateB).toBe('brakeLow');
    const outputs = () => getPhysicalPinDrives('driver').filter((entry) => entry.pin.startsWith('OUT'));
    expect(outputs().find((entry) => entry.pin === 'OUT2')!.drive).toEqual({ voltage: 9, resistance: 1.5 });
    sim.reset(); expect(() => (el as any).stateA).toThrow('unresolved');
    const resetCpu = (sim as any).cpu; resetCpu.writeData(0x101, 0x78); resetCpu.cycles += 10; resetCpu.tick();
    expect((el as any).stateA).toBe('coast');
    resetCpu.cycles = 1600100; resetCpu.tick(); expect((el as any).coastA).toBe(1);
    sim.loadHex(':00000001FF\n'); expect(() => (el as any).stateA).toThrow('unresolved');
    const reloadedCpu = (sim as any).cpu; reloadedCpu.writeData(0x101, 0x78); reloadedCpu.cycles += 10; reloadedCpu.tick();
    expect(() => dispatchSensorUpdate('driver', { enaJumper: true })).toThrow('contends');
    cleanup(); expect(getPhysicalPinDrives('driver')).toHaveLength(0);
    for (const pin of pins) expect(sim.hasExternalPinDrive(pin)).toBe(false);
  });
  it('rejects extra MCU branches, shared regulators, parallel supply paths and unsupported loads', () => {
    circuit([wire('driver', 'IN1', 'board', '5'), wire('driver', 'IN1', 'board', '6')]);
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    const el = document.createElement('velxio-l298n') as L298nElement; Object.assign(el, jumpers);
    expect(() => PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, () => 5, 'driver')).toThrow('one MCU');
    circuit([wire('driver', 'OUT1', 'board', '5V')]);
    expect(() => PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, () => null, 'driver')).toThrow('high-impedance');
    circuit([wire('driver', '+5V', 'other', '+5V')]);
    useSimulatorStore.setState({ components: [...useSimulatorStore.getState().components, { id: 'other', metadataId: 'l298n' }] as any });
    expect(() => l298nSupply('driver', jumpers)).toThrow('shared module');
    circuit(); useSimulatorStore.setState({ components: [...useSimulatorStore.getState().components, ...['r1', 'r2'].map((id) => ({ id, metadataId: 'resistor', properties: { value: '1k' } }))] as any,
      wires: [power[1], power[2], ...['r1', 'r2'].flatMap((id) => [wire('driver', '+12V', id, '1'), wire(id, '2', 'battery', '+')])] });
    expect(() => l298nSupply('driver', jumpers)).toThrow('electrical solver');
  });
  it.each([false, true])('attaches grounded unused bridge inputs with module ground ordered last: %s', (groundLast) => {
    circuit([...['IN3', 'IN4', 'ENB'].map((pin) => wire('driver', pin, 'board', 'GND')),
      wire('driver', 'ENA', 'board', '7'), wire('driver', 'IN1', 'board', '5'), wire('driver', 'IN2', 'board', '6')]);
    if (groundLast) { const wires = useSimulatorStore.getState().wires; useSimulatorStore.setState({ wires: [...wires.slice(3), ...wires.slice(0, 3)] }); }
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    const el = document.createElement('velxio-l298n') as L298nElement; Object.assign(el, jumpers);
    const cleanup = PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, (pin) => ({ ENA: 7, IN1: 5, IN2: 6 }[pin] ?? null), 'driver');
    expect(() => (el as any).stateA).toThrow('unresolved'); expect((el as any).stateB).toBe('coast');
    const cpu = (sim as any).cpu;
    cpu.writeData(0x101, 0x18); cpu.writeData(0x2d, 8); cpu.writeData(0x2e, 8); cpu.writeData(0x102, 0x10); cpu.cycles += 10; cpu.tick();
    expect((el as any).stateA).toBe('positive'); expect((el as any).stateB).toBe('coast');
    expect(getPhysicalPinDrives('driver').filter((entry) => ['OUT3', 'OUT4'].includes(entry.pin)).every((entry) => entry.drive === null)).toBe(true);
    expect(() => dispatchSensorUpdate('driver', { enbJumper: true })).toThrow('shorts to common ground');
    expect(el.enbJumper).toBe(false); cleanup(); expect(getPhysicalPinDrives('driver')).toHaveLength(0);
  });
  it.each(['ENA', 'ENB'])('rejects an installed %s jumper shorted to ground at attachment', (pin) => {
    circuit([wire('driver', pin, 'board', 'GND')]);
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    const el = document.createElement('velxio-l298n') as L298nElement;
    Object.assign(el, { ...jumpers, [pin === 'ENA' ? 'enaJumper' : 'enbJumper']: true });
    expect(() => PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, () => null, 'driver')).toThrow('shorts to common ground');
  });
  it.each([false, true])('rejects shared same-module input pads without real ground, MCU attached: %s', (attached) => {
    circuit([wire('driver', 'IN3', 'driver', 'IN4'), ...(attached ? [wire('driver', 'IN3', 'board', '5')] : [])]);
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    if (attached) { const cpu = (sim as any).cpu; cpu.writeData(0x2d, 8); cpu.writeData(0x2e, 8); }
    const el = document.createElement('velxio-l298n') as L298nElement; Object.assign(el, jumpers);
    expect(() => PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, (pin) => attached && ['IN3', 'IN4'].includes(pin) ? 5 : null, 'driver')).toThrow('input topology');
  });
  it.each([false, true])('rejects a common-grounded shared input group with an MCU branch, active: %s', (active) => {
    circuit([wire('driver', 'IN3', 'board', 'GND'), wire('driver', 'IN4', 'board', 'GND'), wire('driver', 'IN3', 'board', '5')]);
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
    if (active) { const cpu = (sim as any).cpu; cpu.writeData(0x2d, 8); cpu.writeData(0x2e, 8); }
    const el = document.createElement('velxio-l298n') as L298nElement; Object.assign(el, jumpers);
    expect(() => PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, (pin) => ['IN3', 'IN4'].includes(pin) ? 5 : null, 'driver')).toThrow('input topology');
  });
  it('accepts regulator logic consumers without turning them into supply sources', () => {
    circuit([wire('driver', '+5V', 'sensor', 'VIN')]); useSimulatorStore.setState({ components: [...useSimulatorStore.getState().components, { id: 'sensor', metadataId: 'mpr121' }] as any });
    expect(l298nSupply('driver', jumpers).logic?.voltage).toBe(5);
    circuit([wire('driver', 'GND', 'board', '5V')]); expect(() => l298nSupply('driver', jumpers)).toThrow('common ground');
  });
  it('rejects shared module +5V connections regardless of runtime jumper changes', () => {
    const other = document.createElement('velxio-l298n') as L298nElement; other.id = 'other'; other.regulatorJumper = false; document.body.append(other);
    try {
      circuit([wire('driver', '+5V', 'other', '+5V')]); useSimulatorStore.setState({ components: [...useSimulatorStore.getState().components, { id: 'other', metadataId: 'l298n', properties: { regulatorJumper: false } }] as any });
      expect(() => l298nSupply('driver', jumpers)).toThrow('shared module'); other.regulatorJumper = true;
      expect(() => l298nSupply('driver', jumpers)).toThrow('shared module');
    } finally { other.remove(); }
  });
  it.each([5, 9])('allows only nominal AVR-safe output probes at %i V and releases them on coast', (voltage) => {
    circuit(); useSimulatorStore.setState({ components: [{ id: 'supply', metadataId: 'power-supply', properties: { mode: 'dc', voltage, currentLimit: 1 } }] as any,
      wires: [wire('driver', '+12V', 'supply', 'SIG'), wire('supply', 'GND', 'board', 'GND'), power[2], wire('driver', '+5V', 'board', '5V'),
        wire('driver', 'ENA', 'board', '7'), wire('driver', 'IN1', 'board', '5'), wire('driver', 'IN2', 'board', '6'), wire('driver', 'OUT1', 'board', '22'), wire('driver', 'ENB', 'board', 'GND')] });
    const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n'); const cpu = (sim as any).cpu;
    const el = document.createElement('velxio-l298n') as L298nElement; Object.assign(el, { ...jumpers, regulatorJumper: false });
    const cleanup = PartSimulationRegistry.get('l298n')!.attachEvents!(el, sim, (pin) => ({ ENA: 7, IN1: 5, IN2: 6, OUT1: 22 }[pin] ?? null), 'driver');
    cpu.writeData(0x101, 0x18); cpu.writeData(0x2d, 8); cpu.writeData(0x2e, 8); cpu.writeData(0x102, 0x10); cpu.cycles += 10;
    if (voltage === 9) expect(() => cpu.tick()).toThrow('nominal 5V');
    else { cpu.tick(); expect(sim.getResolvedPinVoltage(22)).toBe(5); cpu.writeData(0x102, 0); cpu.cycles += 10; cpu.tick(); expect(sim.getResolvedPinVoltage(22)).toBeNull(); }
    cleanup();
  });
});
