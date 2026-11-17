// A network task's peer role, whichever side runs its peer.py: esp_cloud beside
// an ESP32 (cloud.ts), or the nRF52840's worker (ble_peer.ts). Either reports
// the peer's schema on load and its values on request; the checks below hold
// both to one shape.

import type { PeerSchema } from './jsonl_spec';

export type PeerValue = number | boolean | string;

/** How the role reaches its peer.py. */
export interface PeerTransport {
  /** The peer's `state()` merged with every `@check`. */
  state(): Promise<Record<string, PeerValue>>;
  call(action: string): Promise<void>;
}

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** A schema reply; `source` names the reply in the error. */
export function checkPeerSchema(source: string, reply: unknown): PeerSchema {
  const fields = reply as { actions?: unknown; props?: unknown } | null | undefined;
  const actions = fields?.actions;
  const props = fields?.props;
  if (!isStringList(actions) || !isStringList(props)) {
    throw new Error(`${source}: malformed schema ${JSON.stringify(reply)}`);
  }
  return { actions, props };
}

/** A state reply; `source` names the reply in the error. */
export function checkPeerState(source: string, reply: unknown): Record<string, PeerValue> {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    throw new Error(`${source}: expected an object, got ${JSON.stringify(reply)}`);
  }
  for (const [key, value] of Object.entries(reply)) {
    if (!['number', 'boolean', 'string'].includes(typeof value)) {
      throw new Error(`${source}: '${key}' is ${JSON.stringify(value)}, not a number, bool or string`);
    }
  }
  return reply as Record<string, PeerValue>;
}

/**
 * The peer role as the runner sees it. The guest is parked for every row at one
 * `at`, so the peer's values change only through an action: one state fetch
 * serves every observation at that `at`, and a `do` on the peer forces a refetch.
 */
export class PeerRole {
  private values: Record<string, PeerValue> | null = null;
  private fetchedAtMs: number | null = null;

  constructor(readonly name: string, private transport: PeerTransport) {}

  async observe(atMs: number): Promise<void> {
    if (this.values !== null && this.fetchedAtMs === atMs) return;
    this.values = null;
    this.values = await this.transport.state();
    this.fetchedAtMs = atMs;
  }

  read(prop: string): PeerValue {
    if (this.values === null) throw new Error(`peer '${this.name}': read before its state was fetched`);
    if (!(prop in this.values)) {
      throw new Error(`peer '${this.name}' reported no '${prop}' (got: ${Object.keys(this.values).join(', ')})`);
    }
    return this.values[prop];
  }

  async act(action: string): Promise<void> {
    this.values = null;
    await this.transport.call(action);
  }

  /** A handler can fail after the last observation; its error sticks on the next state. */
  async checkErrors(): Promise<void> {
    await this.transport.state();
  }
}
