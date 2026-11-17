// BoardDriver over velxio's backend QEMU bridge (Esp32Bridge). The backend
// worker runs the guest under icount, started paused (-S): start() loads the
// merged flash image and awaits the worker's 'booted' handshake with zero
// guest instructions executed; runToMs() maps to the bridge's
// run_to/run_stopped round-trip; flushDrives() is the sync barrier that
// proves queued drives crossed the WS -> backend -> worker-stdin hop.
//
// In rebase mode (every ESP run) start() goes one step further and parks
// the guest at application start (app_main, or Arduino's setup()), which the
// firmware announces with a marker the build links in. Every time this driver
// reports or accepts is then relative to that instant, so a test's `at` axis
// means "ms since app start" and ESP variants can share the AVR variant's
// assertion rows. Nrf52Driver constructs with rebase=false and keeps reset
// as its origin.
import { useSimulatorStore, getEsp32Bridge } from '../velxio/frontend/src/store/useSimulatorStore';
import type { BoardDriver, WorkerPeer } from './board_driver';

const BOOT_TIMEOUT_MS = 90_000;

export class Esp32Driver implements BoardDriver {
  private bridge: NonNullable<ReturnType<typeof getEsp32Bridge>> | null = null;
  private serialCb: ((byte: number, tMs: number) => void) | null = null;
  private rawSerialCb: ((byte: number, tMs: number) => void) | null = null;
  private parkedNs = 0;
  private appStartNs = 0;

  constructor(
    protected boardId: string,
    private binB64: string,
    private rebase: boolean,
  ) {}

  onSerialByte(cb: (byte: number, tMs: number) => void): void {
    this.serialCb = cb;
  }

  onConsoleTxComplete(cb: (byte: number, tMs: number) => void): void {
    this.rawSerialCb = cb;
  }

  // The UI's serialWriteToBoard UTF-8-encodes its text, so raw bytes take the
  // bridge's own serial message instead.
  sendConsoleBytes(bytes: readonly number[]): void {
    if (!this.bridge) throw new Error('console send requires a started board');
    if (!bytes.length || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('console send requires byte values 0..255');
    this.bridge.sendSerialBytes([...bytes], 0);
  }

  private emitConsoleByte(byte: number, tMs: number): void {
    this.serialCb?.(byte, tMs);
    this.rawSerialCb?.(byte, tMs);
  }

  async start(atPowerOn: () => Promise<void>): Promise<WorkerPeer | null> {
    const bridge = getEsp32Bridge(this.boardId);
    if (!bridge) throw new Error(`board ${this.boardId} did not produce an ESP32 bridge`);
    this.bridge = bridge;

    bridge.gradingMode = true;
    // Not yet connected, so this stores the image as pending firmware; the
    // store's startBoard() below connects and ships it inside start_esp32.
    bridge.loadFirmware(this.binB64);

    // Boot-phase bytes arrive before app start is known, so in rebase mode
    // they are held until it is, then replayed at negative times.
    const preAppStart: Array<[number, number]> = [];
    bridge.onSerialByteStamped = (byte, uart, tNs) => {
      if (uart !== 0) return;
      if (this.rebase) preAppStart.push([byte, tNs]);
      else this.emitConsoleByte(byte, tNs / 1e6);
    };

    const booted = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`worker did not boot within ${BOOT_TIMEOUT_MS} ms`)),
        BOOT_TIMEOUT_MS,
      );
      const prevSystem = bridge.onSystemEvent;
      bridge.onSystemEvent = (event, data) => {
        prevSystem?.(event, data);
        if (event === 'booted') { clearTimeout(timer); resolve(); }
        if (event === 'crash') {
          clearTimeout(timer);
          reject(new Error(`guest crashed during boot: ${JSON.stringify(data)}`));
        }
      };
      const prevError = bridge.onError;
      bridge.onError = (msg) => {
        prevError?.(msg);
        clearTimeout(timer);
        reject(new Error(`esp32 bridge error: ${msg}`));
      };
    });

    useSimulatorStore.getState().startSimulation();
    await booted;

    if (!this.rebase) return null;
    await atPowerOn();

    // A worker error here (a model rejecting the firmware, or the virtual-time
    // backstop for firmware that never reaches app start) rejects this waiter
    // with the bridge's grading failure. The held boot output is what explains
    // it, so it is passed on first, on the power-on axis since there is no
    // other.
    let appStart: { appStartNs: number; parkedNs: number };
    try {
      appStart = await bridge.runToAppStart();
    } catch (err) {
      for (const [byte, tNs] of preAppStart) this.emitConsoleByte(byte, tNs / 1e6);
      throw err;
    }
    this.appStartNs = appStart.appStartNs;
    this.parkedNs = appStart.parkedNs;

    for (const [byte, tNs] of preAppStart) {
      this.emitConsoleByte(byte, (tNs - this.appStartNs) / 1e6);
    }
    preAppStart.length = 0;
    bridge.onSerialByteStamped = (byte, uart, tNs) => {
      if (uart === 0) this.emitConsoleByte(byte, (tNs - this.appStartNs) / 1e6);
    };
    return null;
  }

  async runToMs(tMs: number): Promise<number> {
    this.parkedNs = await this.bridge!.runTo(Math.round(tMs * 1e6) + this.appStartNs);
    return this.nowMs();
  }

  nowMs(): number {
    return (this.parkedNs - this.appStartNs) / 1e6;
  }

  flushDrives(): Promise<void> {
    return this.bridge!.sync();
  }

  stop(): void {
    useSimulatorStore.getState().stopSimulation();
  }
}
