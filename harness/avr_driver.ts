// BoardDriver over the in-browser avr8js sim — a direct extraction of what
// jsonl_runner did inline before the ESP32 path existed. Behavior-preserving:
// the boot invariant (no await between startSimulation() and arming the cycle
// ceiling) lives inside start(), which parks at cycle 0 in the same macrotask.
import { useSimulatorStore, getBoardSimulator } from '../velxio/frontend/src/store/useSimulatorStore';
import type { BoardDriver, WorkerPeer } from './board_driver';

const CPU_FREQ = 16_000_000;
const MS_TO_CYCLES = CPU_FREQ / 1000;
const PLAYGROUND_I2C_ADDRESSES = [0x48, 0x50, 0x68];

interface AvrSimLike {
  cpu: { cycles: number; data: Uint8Array };
  usart?: { onByteTransmit: ((v: number) => void) | null; txEnable: boolean; bitsPerChar: number; cyclesPerChar: number };
  scheduleClockEvent(callback: () => void, delayCycles: number): void;
  onCpuReset(callback: () => void): () => void;
  runToCycle(targetCycle: number): Promise<void>;
  removeI2CDevice(address: number): void;
}

export class AvrDriver implements BoardDriver {
  private sim: AvrSimLike | null = null;
  private serialCb: ((byte: number, tMs: number) => void) | null = null;
  private rawSerialCb: ((byte: number, tMs: number) => void) | null = null;
  private armed: Promise<void> = Promise.resolve();
  private removeResetListener: (() => void) | null = null;
  private hookedUsart: AvrSimLike['usart'];

  constructor(private boardId: string, private hex: string) {}

  onSerialByte(cb: (byte: number, tMs: number) => void): void {
    this.serialCb = cb;
  }

  onConsoleTxComplete(cb: (byte: number, tMs: number) => void): void { this.rawSerialCb = cb; }

  sendConsoleBytes(bytes: readonly number[]): void {
    if (!this.sim) throw new Error('console send requires a started AVR simulator');
    if (!bytes.length || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('console send requires byte values 0..255');
    if ((getBoardSimulator(this.boardId) as unknown) !== this.sim) throw new Error('console send simulator no longer belongs to the selected board');
    useSimulatorStore.getState().serialWriteToBoard(this.boardId, bytes.map((byte) => String.fromCharCode(byte)).join(''));
  }

  async start(): Promise<WorkerPeer | null> {
    useSimulatorStore.getState().setCompiledHex(this.hex);
    useSimulatorStore.getState().startSimulation();
    // From here to runToCycle(0) below there must be NO await:
    // startSimulation only *scheduled* the first rAF frame, so arming the
    // cycle ceiling in this same macrotask provably beats the first
    // instruction.
    const sim = getBoardSimulator(this.boardId) as unknown as AvrSimLike | null;
    if (!sim) throw new Error(`board ${this.boardId} did not produce a simulator`);
    // The store's loadHex adds playground demo devices at 0x48/0x50/0x68 that
    // no circuit part backs. Circuit parts attach on the hexEpoch bump, after
    // this synchronous block, so their devices are not removed here.
    for (const address of PLAYGROUND_I2C_ADDRESSES) sim.removeI2CDevice(address);
    this.sim = sim;
    this.attachConsoleCallbacks(sim);
    this.removeResetListener = sim.onCpuReset(() => this.attachConsoleCallbacks(sim));
    this.armed = sim.runToCycle(0);
    await this.armed;
    return null;
  }

  private attachConsoleCallbacks(sim: AvrSimLike): void {
    if (sim.usart && sim.usart !== this.hookedUsart && (this.serialCb || this.rawSerialCb)) {
      this.hookedUsart = sim.usart;
      const cb = this.serialCb;
      const raw = this.rawSerialCb;
      // Chain, don't replace: the sim's own handler feeds the Serial Monitor
      // and the oscilloscope's UART waveform.
      const existing = sim.usart.onByteTransmit;
      sim.usart.onByteTransmit = (v: number) => {
        const usart = sim.usart!;
        const cpu = sim.cpu;
        const observing = raw !== null && usart.txEnable;
        const cycles = usart.cyclesPerChar;
        const completeAt = cpu.cycles + cycles;
        if (raw && usart.txEnable) {
          if (!(sim.cpu.data[0xc0] & 0x20)) throw new Error('raw console TX does not support overlapping UDR writes');
          if ((sim.cpu.data[0xc2] & 0xc0) || (sim.cpu.data[0xc2] & 0x30) === 0x10) throw new Error('raw console TX requires asynchronous mode and valid parity');
          if (usart.bitsPerChar !== 8) throw new Error('raw console TX currently requires eight payload bits');
        }
        existing?.(v);
        cb?.(v, (sim.cpu.cycles / CPU_FREQ) * 1000);
        if (observing) {
          sim.scheduleClockEvent(() => {
            if (sim.cpu !== cpu || sim.usart !== usart) return;
            raw!(v & 255, completeAt / MS_TO_CYCLES);
          }, cycles);
        }
      };
    }
  }

  async runToMs(tMs: number): Promise<number> {
    await this.sim!.runToCycle(tMs * MS_TO_CYCLES);
    return this.nowMs();
  }

  nowMs(): number {
    return (this.sim!.cpu.cycles / CPU_FREQ) * 1000;
  }

  async flushDrives(): Promise<void> {
    // In-process sim: dispatchSensorUpdate/do-verbs land synchronously.
  }

  stop(): void {
    this.removeResetListener?.();
    this.removeResetListener = null;
    useSimulatorStore.getState().stopSimulation();
  }

  release(): void {
    // runToCycle() parks the loop at a cycle ceiling and keeps it armed, and
    // only stop() clears it — so free-running again means clearing it here.
    // `pauseAtCycle` is private to AVRSimulator, hence the cast; runToCycle
    // (Infinity) would leave the loop running but its promise unresolved.
    // The rAF loop is still scheduled, so the CPU resumes where it parked.
    (this.sim as unknown as { pauseAtCycle: number | null }).pauseAtCycle = null;
  }
}
