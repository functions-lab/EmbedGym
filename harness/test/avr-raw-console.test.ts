// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { AvrDriver } from '../avr_driver';

const state = vi.hoisted(() => ({ sim: null as unknown, sent: [] as string[] }));
vi.mock('@velxio/store/useSimulatorStore', () => ({
  getBoardSimulator: () => state.sim,
  useSimulatorStore: { getState: () => ({ setCompiledHex() {}, startSimulation() {}, stopSimulation() {}, serialWriteToBoard(_id: string, text: string) { state.sent.push(text); } }) },
}));

const emptyHex = ':00000001FF\n';
function tick(sim: AVRSimulator, target: number): void {
  while (sim.cpu!.cycles < target) { sim.cpu!.cycles++; sim.cpu!.tick(); }
}
function configure(sim: AVRSimulator, control = 6): void {
  sim.cpu!.data[0xc4] = 103;
  sim.cpu!.data[0xc5] = 0;
  sim.cpu!.writeData(0xc2, control);
  sim.cpu!.writeData(0xc1, 0x18);
}
async function setup(variant: 'mega' | 'uno') {
  const sim = new AVRSimulator(new PinManager(), variant);
  sim.loadHex(emptyHex);
  vi.spyOn(sim, 'runToCycle').mockResolvedValue(undefined);
  state.sim = sim;
  const driver = new AvrDriver(variant, emptyHex);
  const legacy: Array<[number, number]> = [], raw: Array<[number, number]> = [];
  driver.onSerialByte((byte, time) => legacy.push([byte, time]));
  driver.onConsoleTxComplete((byte, time) => raw.push([byte, time]));
  await driver.start();
  return { sim, driver, raw, legacy };
}
beforeEach(() => { state.sent = []; });

describe.each(['mega', 'uno'] as const)('%s raw console frame observation', (variant) => {
  it('records completed frames while preserving original line timing', async () => {
    const { sim, raw, legacy } = await setup(variant);
    configure(sim);
    sim.cpu!.writeData(0xc6, 0xff);
    expect(legacy).toEqual([[255, 0]]);
    tick(sim, 16639);
    expect(raw).toEqual([]);
    tick(sim, 16644);
    expect(raw).toEqual([[255, 1.04]]);
  });
  it('ignores disabled TX and rejects unsupported overlapping/mode writes', async () => {
    const { sim, raw } = await setup(variant);
    sim.cpu!.writeData(0xc6, 65);
    tick(sim, 1000);
    expect(raw).toEqual([]);
    configure(sim);
    sim.cpu!.writeData(0xc6, 65);
    expect(() => sim.cpu!.writeData(0xc6, 66)).toThrow(/overlapping/);
    tick(sim, 18000);
    sim.cpu!.writeData(0xc2, 0x46);
    expect(() => sim.cpu!.writeData(0xc6, 66)).toThrow(/asynchronous/);
  });
  it('latches parity/stop/baud at frame start instead of using later configuration', async () => {
    const { sim, raw } = await setup(variant);
    configure(sim, 0x2e);
    sim.cpu!.writeData(0xc6, 13);
    sim.cpu!.writeData(0xc4, 51);
    sim.cpu!.writeData(0xc2, 6);
    tick(sim, 19967);
    expect(raw).toEqual([]);
    tick(sim, 19972);
    expect(raw).toEqual([[13, 1.248]]);
  });
  it('cancels an old CPU frame and observes new USART frames after reset', async () => {
    const { sim, raw } = await setup(variant);
    configure(sim);
    sim.cpu!.writeData(0xc6, 65);
    sim.reset();
    tick(sim, 17000);
    expect(raw).toEqual([]);
    configure(sim);
    sim.cpu!.writeData(0xc6, 66);
    tick(sim, 33644);
    expect(raw).toEqual([[66, 2.1025]]);
  });
  it('sends exact Latin-1 bytes through the actual selected-board UI method', async () => {
    const { driver } = await setup(variant);
    driver.sendConsoleBytes([0, 13, 10, 255]);
    expect(state.sent).toEqual(['\0\r\n\xff']);
    state.sim = null;
    expect(() => driver.sendConsoleBytes([65])).toThrow(/no longer belongs/);
  });
});
