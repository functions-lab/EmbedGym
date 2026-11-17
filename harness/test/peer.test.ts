import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkPeerFile, parseJsonl } from '../jsonl_spec';
import { load, bindDevice, call, state, cloudPeer } from '../cloud';
import { PeerRole } from '../peer';
import { bootedBlePeer, type BlePeerBridge } from '../ble_peer';

const ESP = 'esp32s3_espidf';
const WIFI = `{"target": "${ESP}", "part": "wifi", "name": "wifi"}`;
const PEER = `{"target": "${ESP}", "peer": "peer.py", "name": "cloud"}`;
const rows = (lines: string[]) => parseJsonl(lines.join('\n'), ESP);

describe('checkPeerFile', () => {
  it('returns the peer role when the row and the file agree', () => {
    expect(checkPeerFile(rows([WIFI, PEER]), ESP, true)).toBe('cloud');
    expect(checkPeerFile(rows([WIFI]), ESP, false)).toBeNull();
  });

  it('rejects a peer.py without a peer row', () => {
    expect(() => checkPeerFile(rows([WIFI]), ESP, true))
      .toThrow(`${ESP}/peer.py exists, but test.jsonl has no peer row for '${ESP}'`);
  });

  it('rejects a peer row without a peer.py', () => {
    expect(() => checkPeerFile(rows([WIFI, PEER]), ESP, false))
      .toThrow(`peer row 'cloud' needs ${ESP}/peer.py, which does not exist`);
  });

  it('ignores another target\'s peer row', () => {
    const avrPeer = '{"target": "atmega2560_arduino", "peer": "peer.py", "name": "cloud"}';
    expect(checkPeerFile(rows([WIFI, avrPeer]), ESP, false)).toBeNull();
  });
});

type Reply = { status: number; body: string };

// Replaces fetch with a queue of canned replies and records every request.
function stubFetch(replies: Reply[]) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({
      url,
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const reply = replies.shift();
    if (reply === undefined) throw new Error(`unexpected request ${url}`);
    return new Response(reply.body, { status: reply.status });
  });
  return requests;
}

const ok = (value: unknown): Reply => ({ status: 200, body: JSON.stringify(value) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cloud requests', () => {
  it('sends each call to its control route under /embedgym-cloud', async () => {
    const requests = stubFetch([ok({ actions: ['on'], props: ['n'] }), ok({}), ok({}), ok({ n: 3 })]);
    expect(await load('test/x', ESP)).toEqual({ actions: ['on'], props: ['n'] });
    await bindDevice('tab::esp32-s3');
    await call('on');
    expect(await state(50)).toEqual({ n: 3 });
    expect(requests).toEqual([
      { url: '/embedgym-cloud/load', method: 'POST', body: { task_dir: 'test/x', target: ESP } },
      { url: '/embedgym-cloud/bind_device', method: 'POST', body: { client_id: 'tab::esp32-s3' } },
      { url: '/embedgym-cloud/call', method: 'POST', body: { name: 'on' } },
      { url: '/embedgym-cloud/state?quiet_ms=50', method: 'GET', body: undefined },
    ]);
  });

  it('throws the server\'s error message', async () => {
    stubFetch([{ status: 500, body: JSON.stringify({ error: 'peer error:\naction boom: RuntimeError: x' }) }]);
    await expect(call('boom')).rejects.toThrow('esp_cloud /call: HTTP 500: peer error:\naction boom: RuntimeError: x');
  });

  it('throws on a non-2xx reply without an error field', async () => {
    stubFetch([{ status: 502, body: '{}' }]);
    await expect(call('on')).rejects.toThrow('esp_cloud /call: HTTP 502: {}');
  });

  it('treats a 2xx body as data even when it has an error key', async () => {
    stubFetch([ok({ error: false, n: 2 })]);
    await expect(state(50)).resolves.toEqual({ error: false, n: 2 });
  });

  it('throws on a non-JSON reply', async () => {
    stubFetch([{ status: 500, body: '' }]);
    await expect(state(50)).rejects.toThrow('esp_cloud /state?quiet_ms=50: HTTP 500 with a non-JSON body ""');
  });

  it('rejects a malformed schema or state value', async () => {
    stubFetch([ok({ actions: ['on'] })]);
    await expect(load('test/x', ESP)).rejects.toThrow(/malformed schema/);
    stubFetch([ok({ n: null })]);
    await expect(state(50)).rejects.toThrow("esp_cloud /state: 'n' is null, not a number, bool or string");
  });
});

describe('PeerRole', () => {
  it('fetches /state once per `at`', async () => {
    const requests = stubFetch([ok({ n: 1, row0: 'x' }), ok({ n: 2, row0: 'y' })]);
    const peer = new PeerRole('cloud', cloudPeer);
    await peer.observe(3000);
    await peer.observe(3000);
    expect([peer.read('n'), peer.read('row0')]).toEqual([1, 'x']);
    await peer.observe(4000);
    expect(peer.read('n')).toBe(2);
    expect(requests).toHaveLength(2);
  });

  it('refetches after an action at the same `at`', async () => {
    const requests = stubFetch([ok({ n: 0 }), ok({}), ok({ n: 1 })]);
    const peer = new PeerRole('cloud', cloudPeer);
    await peer.observe(3000);
    expect(peer.read('n')).toBe(0);
    await peer.act('on');
    expect(() => peer.read('n')).toThrow(/read before its state was fetched/);
    await peer.observe(3000);
    expect(peer.read('n')).toBe(1);
    expect(requests.map((r) => r.url)).toEqual([
      '/embedgym-cloud/state?quiet_ms=50', '/embedgym-cloud/call', '/embedgym-cloud/state?quiet_ms=50',
    ]);
  });

  it('does not keep a failed fetch', async () => {
    stubFetch([
      { status: 500, body: JSON.stringify({ error: 'peer error: x' }) },
      { status: 500, body: JSON.stringify({ error: 'peer error: x' }) },
    ]);
    const peer = new PeerRole('cloud', cloudPeer);
    await expect(peer.observe(3000)).rejects.toThrow('esp_cloud /state?quiet_ms=50: HTTP 500: peer error: x');
    await expect(peer.observe(3000)).rejects.toThrow('peer error: x');
  });

  it('rejects a prop the peer did not report', async () => {
    stubFetch([ok({ n: 1 })]);
    const peer = new PeerRole('cloud', cloudPeer);
    await peer.observe(3000);
    expect(() => peer.read('m')).toThrow("peer 'cloud' reported no 'm' (got: n)");
  });
});

// Stands in for the board's Esp32Bridge: records each request and answers it
// from a queue, as the worker does while the guest is parked.
function mockBridge(schema: unknown, replies: Array<unknown>) {
  const requests: string[] = [];
  const next = async () => {
    if (replies.length === 0) throw new Error('unexpected request');
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const bridge: BlePeerBridge = {
    blePeerSchema: schema,
    peerCall: async (action) => { requests.push(`call ${action}`); await next(); },
    peerState: async () => { requests.push('state'); return next(); },
  };
  return { bridge, requests };
}

describe('BLE peer over the bridge', () => {
  const schema = { actions: ['pause'], props: ['reports', 'last'] };

  it('reports the schema the worker booted with', () => {
    expect(bootedBlePeer(mockBridge(schema, []).bridge).schema).toEqual(schema);
  });

  it('fails when the worker booted without the peer or with a malformed schema', () => {
    expect(() => bootedBlePeer(mockBridge(undefined, []).bridge))
      .toThrow('the nRF worker booted without loading the peer');
    expect(() => bootedBlePeer(mockBridge({ actions: ['pause'] }, []).bridge))
      .toThrow('nRF worker booted with: malformed schema {"actions":["pause"]}');
  });

  it('fetches one state per `at` and refetches after an action', async () => {
    const { bridge, requests } = mockBridge(schema, [
      { reports: 3, last: 'x' }, undefined, { reports: 4, last: 'y' }, { reports: 5, last: 'z' },
    ]);
    const peer = new PeerRole('phone', bootedBlePeer(bridge).transport);
    await peer.observe(2500);
    await peer.observe(2500);
    expect(peer.read('reports')).toBe(3);
    await peer.act('pause');
    expect(() => peer.read('reports')).toThrow(/read before its state was fetched/);
    await peer.observe(2500);
    expect(peer.read('last')).toBe('y');
    await peer.observe(3000);
    expect(peer.read('reports')).toBe(5);
    expect(requests).toEqual(['state', 'call pause', 'state', 'state']);
  });

  it('rejects a state that is not an object of numbers, bools and strings', async () => {
    const { bridge } = mockBridge(schema, [{ reports: [1] }, ['x']]);
    const peer = new PeerRole('phone', bootedBlePeer(bridge).transport);
    await expect(peer.observe(500)).rejects.toThrow("nRF peer state: 'reports' is [1], not a number, bool or string");
    await expect(peer.observe(500)).rejects.toThrow('nRF peer state: expected an object, got ["x"]');
  });

  it("passes the peer's errors on, including one the final check finds", async () => {
    const { bridge } = mockBridge(schema, [
      new Error('peer action pause: RuntimeError: boom'), new Error('peer state: ValueError: late'),
    ]);
    const peer = new PeerRole('phone', bootedBlePeer(bridge).transport);
    await expect(peer.act('pause')).rejects.toThrow('peer action pause: RuntimeError: boom');
    await expect(peer.checkErrors()).rejects.toThrow('peer state: ValueError: late');
  });
});
