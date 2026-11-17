import { describe, expect, it, vi } from 'vitest';
import { Esp32Driver } from '../esp32_driver';

type Stamped = (byte: number, uart: number, tNs: number) => void;
interface FakeBridge {
  gradingMode: boolean;
  onSerialByteStamped: Stamped | null;
  onSystemEvent: ((event: string, data: unknown) => void) | null;
  onError: ((msg: string) => void) | null;
  sent: Array<[number[], number]>;
  calls: string[];
  loadFirmware(): void;
  sendSerialBytes(bytes: number[], uart: number): void;
  runToAppStart(): Promise<{ appStartNs: number; parkedNs: number }>;
}

const state = vi.hoisted(() => ({ bridge: null as unknown }));
vi.mock('@velxio/store/useSimulatorStore', () => ({
  getEsp32Bridge: () => state.bridge,
  useSimulatorStore: { getState: () => ({ startSimulation() { (state.bridge as FakeBridge).onSystemEvent?.('booted', {}); }, stopSimulation() {} }) },
}));

function fakeBridge(): FakeBridge {
  const bridge: FakeBridge = {
    gradingMode: false,
    onSerialByteStamped: null,
    onSystemEvent: null,
    onError: null,
    sent: [],
    calls: [],
    loadFirmware() {},
    sendSerialBytes(bytes, uart) { bridge.sent.push([bytes, uart]); },
    async runToAppStart() {
      bridge.calls.push('app start');
      bridge.onSerialByteStamped!(0x41, 0, 1_000_000);
      bridge.onSerialByteStamped!(0x42, 1, 1_500_000);
      return { appStartNs: 2_000_000, parkedNs: 2_000_000 };
    },
  };
  return bridge;
}

async function setup(rebase: boolean) {
  const bridge = fakeBridge();
  state.bridge = bridge;
  const driver = new Esp32Driver('board', '', rebase);
  const lines: Array<[number, number]> = [], raw: Array<[number, number]> = [];
  driver.onSerialByte((byte, t) => lines.push([byte, t]));
  driver.onConsoleTxComplete((byte, t) => raw.push([byte, t]));
  await driver.start(async () => { bridge.calls.push('power-on'); });
  return { bridge, driver, lines, raw };
}

describe('backend console bytes', () => {
  it('feeds every console TX byte to serial.txHex with the serial-line stamps', async () => {
    const { bridge, lines, raw } = await setup(true);
    for (const [byte, tNs] of [[0, 3_000_000], [13, 3_000_100], [10, 3_000_200], [255, 4_000_000]]) bridge.onSerialByteStamped!(byte, 0, tNs);
    bridge.onSerialByteStamped!(0x43, 1, 5_000_000);
    expect(raw).toEqual([[0x41, -1], [0, 1], [13, 1.0001], [10, 1.0002], [255, 2]]);
    expect(lines).toEqual(raw);
  });
  it('stamps without rebase on the reset axis', async () => {
    const { bridge, raw } = await setup(false);
    bridge.onSerialByteStamped!(0xff, 0, 260_000);
    expect(raw).toEqual([[0xff, 0.26]]);
  });
  it('sends exact console RX bytes on UART 0', async () => {
    const { bridge, driver } = await setup(false);
    driver.sendConsoleBytes([0, 13, 10, 255]);
    expect(bridge.sent).toEqual([[[0, 13, 10, 255], 0]]);
    for (const bad of [[], [256], [-1], [0.5]]) expect(() => driver.sendConsoleBytes(bad)).toThrow('console send requires byte values 0..255');
  });
  it('runs the power-on callback before app start, and only when it precedes the origin', async () => {
    expect((await setup(true)).bridge.calls).toEqual(['power-on', 'app start']);
    expect((await setup(false)).bridge.calls).toEqual([]);
  });
  it('rejects a send before start', () => {
    expect(() => new Esp32Driver('board', '', true).sendConsoleBytes([65])).toThrow('console send requires a started board');
  });
});
