// esp_cloud's control API (docker/esp_cloud_image/server.py), reached through vite's
// /embedgym-cloud proxy, which adds the control token so the page never holds it.
// A non-2xx reply or an `error` body throws with esp_cloud's message.

import type { PeerSchema } from './jsonl_spec';
import { checkPeerSchema, checkPeerState, type PeerTransport, type PeerValue } from './peer';

// /state waits this long without inbound peer traffic before it answers.
const STATE_QUIET_MS = 50;

async function request(method: 'GET' | 'POST', path: string, body?: Record<string, string>): Promise<unknown> {
  const res = await fetch(`/embedgym-cloud${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    throw new Error(`esp_cloud ${path}: HTTP ${res.status} with a non-JSON body ${JSON.stringify(text.slice(0, 500))}`);
  }
  if (!res.ok) {
    const error = typeof reply === 'object' && reply !== null && 'error' in reply
      ? String((reply as { error: unknown }).error)
      : text;
    throw new Error(`esp_cloud ${path}: HTTP ${res.status}: ${error}`);
  }
  return reply;
}

/** Reset esp_cloud's services and load `<taskDir>/<target>/peer.py`; returns its schema. */
export async function load(taskDir: string, target: string): Promise<PeerSchema> {
  return checkPeerSchema('esp_cloud /load', await request('POST', '/load', { task_dir: taskDir, target }));
}

/** The gateway id the peer's `self.device` requests go to. */
export async function bindDevice(clientId: string): Promise<void> {
  await request('POST', '/bind_device', { client_id: clientId });
}

export async function call(action: string): Promise<void> {
  await request('POST', '/call', { name: action });
}

/** The peer's `state()` merged with every `@check`, once its traffic is quiet. */
export async function state(quietMs: number): Promise<Record<string, PeerValue>> {
  return checkPeerState('esp_cloud /state', await request('GET', `/state?quiet_ms=${quietMs}`));
}

/** The peer role's requests to esp_cloud, which answers /state once the peer's traffic is quiet. */
export const cloudPeer: PeerTransport = { state: () => state(STATE_QUIET_MS), call };
