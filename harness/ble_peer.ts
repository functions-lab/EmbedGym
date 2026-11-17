// The nRF52840's BLE peer as the runner reaches it, through the board's bridge.
// Its peer.py runs inside the Renode worker in lockstep with the guest: the
// worker loads it as the board boots (Nrf52Driver names it in the start
// payload) and reports its schema on `booted`. While the guest is parked the
// peer is too, so one peer_state is its state at that instant, with no quiet
// wait as on esp_cloud.

import { checkPeerSchema, checkPeerState } from './peer';
import type { WorkerPeer } from './board_driver';

/** What this needs of the board's Esp32Bridge. */
export interface BlePeerBridge {
  readonly blePeerSchema: unknown;
  peerCall(action: string): Promise<void>;
  peerState(): Promise<unknown>;
}

/** The peer the worker reported on boot. */
export function bootedBlePeer(bridge: BlePeerBridge): WorkerPeer {
  if (bridge.blePeerSchema === undefined) throw new Error('the nRF worker booted without loading the peer');
  return {
    schema: checkPeerSchema('nRF worker booted with', bridge.blePeerSchema),
    transport: {
      state: async () => checkPeerState('nRF peer state', await bridge.peerState()),
      call: (action) => bridge.peerCall(action),
    },
  };
}
