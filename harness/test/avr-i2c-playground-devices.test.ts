// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { I2CMemoryDevice, VirtualDS1307, VirtualTempSensor } from '@velxio/simulation/I2CBusManager';
import { AvrDriver } from '../avr_driver';

const state = vi.hoisted(() => ({ sim: null as unknown }));
// Mirrors the store's loadHex, which adds the playground's demo devices.
vi.mock('@velxio/store/useSimulatorStore', () => ({
  getBoardSimulator: () => state.sim,
  useSimulatorStore: {
    getState: () => ({
      setCompiledHex() {
        const sim = state.sim as AVRSimulator;
        sim.addI2CDevice(new VirtualDS1307());
        sim.addI2CDevice(new VirtualTempSensor());
        sim.addI2CDevice(new I2CMemoryDevice(0x50));
      },
      startSimulation() {},
    }),
  },
}));

const emptyHex = ':00000001FF\n';

function connectAcks(sim: AVRSimulator, address: number): boolean {
  const bus = sim.getI2CBus();
  const completeConnect = vi.spyOn(bus.twi, 'completeConnect').mockImplementation(() => {});
  bus.connectToSlave(address, true);
  const ack = completeConnect.mock.calls[0][0] as boolean;
  completeConnect.mockRestore();
  bus.stop();
  return ack;
}

describe.each(['mega', 'uno'] as const)('%s playground I2C devices', (variant) => {
  it('NACKs the demo addresses and keeps devices a part attaches after start', async () => {
    const sim = new AVRSimulator(new PinManager(), variant);
    sim.loadHex(emptyHex);
    vi.spyOn(sim, 'runToCycle').mockResolvedValue(undefined);
    state.sim = sim;
    await new AvrDriver(variant, emptyHex).start();

    expect(sim.getI2CBus().listDevices()).toEqual([]);
    for (const address of [0x48, 0x50, 0x68]) expect(connectAcks(sim, address)).toBe(false);

    sim.addI2CDevice(new VirtualDS1307(() => 0));
    expect(connectAcks(sim, 0x68)).toBe(true);
  });
});
