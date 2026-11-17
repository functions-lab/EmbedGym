// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineSensorElement } from '../../elements/LineSensorElement';
import '../../sim/LineSensor';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { useElectricalStore } from '@velxio/store/useElectricalStore';
import { getPhysicalPinDrives } from '@velxio/simulation/PhysicalPinDrives';
import { dispatchSensorUpdate, hasSensorUpdateHandler } from '@velxio/simulation/SensorUpdateRegistry';

vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', vi.fn());
const wire = (a: string, ap: string, b: string, bp: string) => ({ id: `${a}:${ap}:${b}:${bp}`, start: { componentId: a, pinName: ap, x: 0, y: 0 }, end: { componentId: b, pinName: bp, x: 0, y: 0 } });
let remove: (() => void) | undefined;
function attach(extra: ReturnType<typeof wire>[] = [], parts: any[] = [], configure?: (sim: AVRSimulator) => void, supplyPin = '5V') {
  useSimulatorStore.setState({ boards: [{ id: 'board', boardKind: 'arduino-mega' }] as any, components: [{ id: 'sensor', metadataId: 'line-sensor' }, ...parts] as any,
    wires: [wire('sensor', 'VCC', 'board', supplyPin), wire('sensor', 'GND', 'board', 'GND'), ...['L', 'M', 'R'].map((pin, i) => wire('sensor', pin, 'board', String(24 + i))), ...extra] });
  const sim = new AVRSimulator(new PinManager(), 'mega'); sim.loadHex(':00000001FF\n');
  configure?.(sim);
  const el = document.createElement('velxio-line-sensor') as LineSensorElement;
  remove = PartSimulationRegistry.get('line-sensor')!.attachEvents!(el, sim, () => null, 'sensor');
  return { sim, el, cpu: (sim as any).cpu };
}
afterEach(() => { remove?.(); remove = undefined; useSimulatorStore.setState({ boards: [], components: [], wires: [] }); useElectricalStore.getState().reset(); });

describe('line sensor physical attachment and actual controls', () => {
  it('registers five canonical pads and shared physical pot input', () => {
    const { el, sim } = attach();
    expect(el.pinInfo.map((pin) => pin.name)).toEqual(['VCC', 'L', 'M', 'R', 'GND']);
    expect(el.pinInfo[2]).toMatchObject({ x: 127.60000000000001, y: 119 });
    expect(sim.getResolvedPinVoltage(24)).toBeGreaterThan(3.3);
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 300 });
    expect(sim.getResolvedPinVoltage(24)).toBeLessThan(0.8);
    expect(sim.getResolvedPinVoltage(25)).toBeGreaterThan(3.3);
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 240, middlePhotocurrentUa: 240, rightPhotocurrentUa: 240, thresholdPosition: 0.4 });
    const pot = el.shadowRoot!.querySelector('input') as HTMLInputElement;
    pot.value = '0.6'; pot.dispatchEvent(new Event('input'));
    for (const pin of [24, 25, 26]) expect(sim.getResolvedPinVoltage(pin)).toBeLessThan(0.8);
    expect(el.thresholdPosition).toBe(0.6);
    expect(el.shadowRoot!.querySelector('[data-indicator="L"]')!.getAttribute('fill')).toBe('#e64435');
    expect(getPhysicalPinDrives('sensor')).toHaveLength(4);
    remove!(); remove = undefined;
    expect(hasSensorUpdateHandler('sensor')).toBe(false);
    expect(getPhysicalPinDrives('sensor')).toHaveLength(0);
    for (const pin of [24, 25, 26]) expect(sim.hasExternalPinDrive(pin)).toBe(false);
  });
  it('recomputes actual MCU pullups, resets and same-logic raw supply changes', () => {
    const { sim, el, cpu } = attach();
    const before = (el as any).leftVoltage;
    cpu.writeData(0x22, 4); cpu.cycles += 10; cpu.tick();
    expect((el as any).leftVoltage).toBeGreaterThan(before);
    sim.reset(); expect((el as any).leftVoltage).toBeCloseTo(before, 8);
    const map = new Map([['sensor:VCC', 'supply'], ['sensor:GND', '0']]);
    useElectricalStore.setState({ pinNetMap: map, nodeVoltages: { supply: 5.1 }, solvedComponents: [{ id: 'sensor', properties: {} }] });
    expect((el as any).leftVoltage).toBeGreaterThan(before + 0.09);
    expect((el as any).supplyVoltage).toBe(5.1);
    useElectricalStore.setState({ nodeVoltages: { supply: 4.9 } });
    expect((el as any).leftVoltage).toBeLessThan(before - 0.09);
    expect((el as any).supplyVoltage).toBe(4.9);
  });
  it('never silently keeps a valid observation after unsupported physical stimuli', () => {
    const { sim, el } = attach();
    expect(() => dispatchSensorUpdate('sensor', { detected: true })).toThrow('unknown');
    expect(() => dispatchSensorUpdate('sensor', { leftPhotocurrentUa: NaN })).toThrow('finite');
    expect(() => dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 250 })).toThrow('unresolved');
    expect(() => (el as any).leftVoltage).toThrow('unresolved');
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 300 });
    expect(sim.getResolvedPinVoltage(24)).toBeLessThan(0.8);
  });
  it('raises raw rail failure on CPU time and rejects MCU output contention', () => {
    const { sim, el, cpu } = attach();
    expect(() => useElectricalStore.setState({ pinNetMap: new Map([['sensor:VCC', 'supply'], ['sensor:GND', '0']]), nodeVoltages: { supply: 2.9 }, solvedComponents: [{ id: 'sensor', properties: {} }] })).toThrow('3.0..5.1');
    expect(() => (el as any).leftVoltage).toThrow('3.0..5.1');
    cpu.cycles += 10; expect(() => cpu.tick()).toThrow('3.0..5.1');
    useElectricalStore.getState().reset();
    expect(() => cpu.writeData(0x21, 4)).toThrow('remain an input');
    expect(sim.hasExternalPinDrive(24)).toBe(true);
  });
  it('runs from a 3.3 V board rail with the same circuit, and rejects pulls above it', () => {
    const { sim, el, cpu } = attach([], [], undefined, '3.3V');
    expect((el as any).supplyVoltage).toBe(3.3);
    for (const pin of [24, 25, 26]) expect(sim.getResolvedPinVoltage(pin)).toBeLessThan(0.8);
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 100 });
    expect(sim.getResolvedPinVoltage(24)).toBeGreaterThan(2.0);
    expect(sim.getResolvedPinVoltage(24)).toBeLessThan(2.3);
    expect(() => dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 300 })).toThrow('saturation');
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 100 });
    expect(() => { cpu.writeData(0x22, 4); cpu.cycles += 10; cpu.tick(); }).toThrow('unsupported output load');
    remove!(); remove = undefined;
    const pull = [{ id: 'pullR', metadataId: 'resistor', properties: { value: '30k' } }];
    expect(() => attach([wire('sensor', 'L', 'pullR', '1'), wire('pullR', '2', 'board', '5V')], pull, undefined, '3.3V')).toThrow('module supply rail');
  });
  it('rejects unknown loads, hard rail shorts and duplicate MCU branches', () => {
    expect(() => attach([wire('sensor', 'L', 'unknown', 'IN')])).toThrow('load topology');
    expect(() => attach([wire('sensor', 'L', 'board', 'GND')])).toThrow('ground topology');
    expect(() => attach([wire('sensor', 'L', 'board', '27')])).toThrow('one MCU');
  });
  it('counts a resistor connected to the module/board common ground once', () => {
    const { el, sim } = attach([wire('sensor', 'L', 'load', '1'), wire('load', '2', 'sensor', 'GND')], [{ id: 'load', metadataId: 'resistor', properties: { value: '10k' } }]);
    expect((el as any).leftVoltage).toBeGreaterThan(3.5);
    expect((el as any).leftVoltage).toBeLessThan(3.8);
    expect(sim.getResolvedPinVoltage(24)).toBeCloseTo((el as any).leftVoltage, 8);
    dispatchSensorUpdate('sensor', { leftPhotocurrentUa: 300 });
    expect(sim.getResolvedPinVoltage(24)).toBeCloseTo((el as any).leftVoltage, 8);
  });
  it('rejects aggregate parallel pulls and disposes an attachment that starts in MCU output mode', () => {
    const parts = ['r1', 'r2'].map((id) => ({ id, metadataId: 'resistor', properties: { value: '10k' } }));
    const wires = parts.flatMap((part) => [wire('sensor', 'L', part.id, '1'), wire(part.id, '2', 'board', 'GND')]);
    expect(() => attach(wires, parts)).toThrow('aggregate');
    expect(hasSensorUpdateHandler('sensor')).toBe(false);
    expect(getPhysicalPinDrives('sensor')).toHaveLength(0);
    let started: AVRSimulator | undefined;
    expect(() => attach([], [], (sim) => { started = sim; (sim as any).cpu.writeData(0x21, 4); })).toThrow('remain an input');
    expect(hasSensorUpdateHandler('sensor')).toBe(false);
    expect(getPhysicalPinDrives('sensor')).toHaveLength(0);
    expect(started!.hasExternalPinDrive(24)).toBe(false);
  });
  it('explicitly rejects coupled series-supply and local-output pull networks', () => {
    const { el, sim } = attach();
    remove!(); remove = undefined;
    const state = useSimulatorStore.getState();
    useSimulatorStore.setState({ components: [...state.components, { id: 'supplyR', metadataId: 'resistor', properties: { value: '1' } }, { id: 'pullR', metadataId: 'resistor', properties: { value: '30k' } }] as any,
      wires: [...state.wires.filter((candidate) => candidate.start.pinName !== 'VCC'), wire('sensor', 'VCC', 'supplyR', '1'), wire('supplyR', '2', 'board', '5V'), wire('sensor', 'L', 'pullR', '1'), wire('pullR', '2', 'sensor', 'VCC')] });
    expect(() => PartSimulationRegistry.get('line-sensor')!.attachEvents!(el, sim, () => null, 'sensor')).toThrow('unsupported supply topology');
    expect(hasSensorUpdateHandler('sensor')).toBe(false);
  });
  it('rejects a level-shifter channel on the 5 V MCU', () => {
    const { el, sim } = attach();
    remove!(); remove = undefined;
    const state = useSimulatorStore.getState();
    useSimulatorStore.setState({ components: [...state.components, { id: 'ls', metadataId: 'level-shifter' }] as any,
      wires: [...state.wires.filter((candidate) => candidate.start.pinName !== 'L'), wire('sensor', 'L', 'ls', 'HV1'), wire('ls', 'LV1', 'board', '24'), wire('ls', 'HV', 'board', '5V'), wire('ls', 'LV', 'board', '3.3V')] });
    expect(() => PartSimulationRegistry.get('line-sensor')!.attachEvents!(el, sim, () => null, 'sensor')).toThrow("level-shifter LV must be the MCU's 5 V I/O rail, below HV");
  });
});
