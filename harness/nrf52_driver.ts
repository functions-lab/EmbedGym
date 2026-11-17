// BoardDriver for the Renode nRF52840 worker, which speaks the same WS
// protocol as the QEMU worker and is reached through the same Esp32Bridge.
// The one difference is the time origin: Zephyr's main() starts ~0.3 ms after
// reset, so there is no boot phase to hide and no app-start marker to rebase
// onto — `at` = 0 is reset. That is exactly Esp32Driver's non-rebased mode
// (booted handshake, runTo(t·1e6), sync barrier, serial stamps passed
// through), so this is that mode under its own name rather than a copy.
//
// A BLE task's peer.py runs inside the worker (ble_peer.ts): start() names it
// in the start payload, with the grader token the backend checks first.
import { getEsp32Bridge } from '../velxio/frontend/src/store/useSimulatorStore';
import { Esp32Driver } from './esp32_driver';
import { bootedBlePeer } from './ble_peer';
import type { WorkerPeer } from './board_driver';

export class Nrf52Driver extends Esp32Driver {
  /** `peerFile` is relative to the repo root, null without a peer. */
  constructor(
    boardId: string,
    elfB64: string,
    private peerFile: string | null,
    private peerToken: string | null,
  ) {
    super(boardId, elfB64, false);
  }

  async start(atPowerOn: () => Promise<void>): Promise<WorkerPeer | null> {
    const bridge = getEsp32Bridge(this.boardId);
    if (!bridge) throw new Error(`board ${this.boardId} did not produce an nRF52840 bridge`);
    bridge.blePeer = this.peerFile;
    bridge.blePeerToken = this.peerToken;
    await super.start(atPowerOn);
    return this.peerFile === null ? null : bootedBlePeer(bridge);
  }
}
