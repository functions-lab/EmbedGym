// The board-kind seam of the runner: everything CPU-specific (how firmware is
// loaded, how virtual time advances, where serial bytes come from) sits behind
// this interface. jsonl_runner drives the timeline through it and stays
// board-agnostic; avr_driver wraps the in-browser avr8js sim, esp32_driver the
// backend QEMU bridge.
import type { PeerSchema } from './jsonl_spec';
import type { PeerTransport } from './peer';

/** A peer.py the board's worker loaded with the firmware (the nRF52840's BLE
 * peer): its schema, and how the runner reaches it while the guest is parked. */
export interface WorkerPeer { schema: PeerSchema; transport: PeerTransport; }

export interface BoardDriver {
  /**
   * Load the firmware and start the sim parked where the test's t=0 axis
   * begins, so caller-applied t=0 drives land before any user code runs. On
   * AVR that is power-on reset, with zero guest instructions executed. On
   * ESP32 it is application start (app_main, or Arduino's setup()), which the
   * firmware announces via a marker the build links in — parking there rather
   * than at power-on hides ~500 ms of ROM/bootloader that has no AVR
   * counterpart. (The park lands a few deterministic µs after the marker
   * byte, orders of magnitude below the ≥10 ms edge distance ESP assertions
   * are authored with.)
   * The guest only advances inside runToMs().
   * `atPowerOn` runs while the guest is parked at power-on with the parts
   * attached, when that precedes the t=0 origin (ESP32's boot); a driver whose
   * origin is power-on never calls it.
   * Resolves the peer the worker loaded with the firmware, null for none.
   */
  start(atPowerOn: () => Promise<void>): Promise<WorkerPeer | null>;
  /** Park at virtual tMs on the t=0 axis start() established; resolves the
   * actual parked ms. Virtual time is frozen while parked. */
  runToMs(tMs: number): Promise<number>;
  /** Virtual ms of the current park. */
  nowMs(): number;
  /** Serial TX bytes, stamped with the virtual ms they left the UART.
   * Register before start(); the driver attaches it during boot. */
  onSerialByte(cb: (byte: number, tMs: number) => void): void;
  /** Raw bytes into the console UART RX, through the transport the UI serial monitor uses. */
  sendConsoleBytes(bytes: readonly number[]): void;
  /** Every console TX byte for serial.txHex. AVR stamps it when its frame
   * completes; the backend workers when it leaves the UART, as onSerialByte.
   * Register before start(). */
  onConsoleTxComplete(cb: (byte: number, tMs: number) => void): void;
  /**
   * Barrier: resolves once every drive issued so far (pin/ADC/sensor writes)
   * has landed in the MCU. A no-op for in-process sims; the ESP driver acks
   * the WS→backend→worker hop.
   */
  flushDrives(): Promise<void>;
  stop(): void;
  /**
   * Drop the cycle ceiling and let the guest free-run instead of stopping it.
   * Grading is over, so virtual time no longer has to be exact. Optional — a
   * driver that cannot free-run omits it and the runner stops.
   */
  release?(): void;
}
