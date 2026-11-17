"""BLE probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser) with the phone
("ble" config) and ble_probe/peer.py, and runs the ble_probe/ firmware: a
peripheral advertising "GYM Probe" whose LED characteristic drives P1.15
(global pin 47), whose COUNTER notifies 1, 2, 3, … every 100 ms while
subscribed, and whose BULK and BURST take and send 244-byte frames. The
phone scans by name, connects, subscribes and counts, then goes to MTU 247
and data length 251. Whatever the phone finds wrong with the board (a missing
characteristic, an ATT error, a malformed notification) is a problem it
counts; every state read asserts none.

  1. booted carries the peer's schema; app_started is at t_ns 0.
  2. Parks at 1000 / 1500.123456 / 2000 / 2250.000777 / 3000 / 3500.000333 /
     5000 ms land exactly.
  3. By 1000 ms the phone is connected and subscribed. Notifications arrive
     in order with no gap, 4 bytes each, about one per 100 ms. By 3000 ms
     both directions carry 251-byte LL payloads.
  4. peer_state twice at one park reads the same; an unknown action is refused
     and is not sticky.
  5. led_on at 1500.123456 ms raises P1.15 before the phone sees its write
     acknowledged, before 2000 ms; led_off at 2250.000777 ms drops it before
     3000 ms. The board prints the LED lines and no error or disconnect.
  6. bulk at 3000 ms: all 20 frames of 244 bytes the phone writes without
     response reach the board intact (every H4 byte into the phone's
     controller lands). burst at 3500.000333 ms: all 20 notification frames
     reach the phone intact and in order. By 5000 ms COUNTER is still in
     order and has kept going through both, at 251-byte payloads.
  7. An action that raises fails its peer_call, and every peer_call and
     peer_state after it, without stopping the worker.
  8. The worker's stdout is written to --transcript as it came; two runs
     must be byte-identical.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT, EMBEDGYM_BLE_CONTROLLER_ELF, EMBEDGYM_ROOT
(the worker reads them; the sim image sets all four), and Bumble importable.
Build the firmware first, in the sim container:
  source /opt/venv/bin/activate; cd /opt/zephyrproject
  west build -p always -b nrf52840dk/nrf52840 \\
      /embedgym/selftests/probes/nrf52840_zephyr/ble_probe/app -d /tmp/ble_probe
Usage (in the sim container):
  PYTHONPATH=/app/app/services:/embedgym/parts /opt/venv/bin/python \\
      /embedgym/selftests/probes/nrf52840_zephyr/ble_probe.py \\
      --worker /app/app/services/nrf52_worker.py --firmware /tmp/ble_probe/zephyr/zephyr.elf \\
      --transcript /tmp/ble1.jsonl
Exit 0 = all checks pass.
"""
import argparse
import base64
import json
import os
import queue
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'velxio', 'backend', 'app', 'services', 'nrf52_worker.py'))
PEER = 'selftests/probes/nrf52840_zephyr/ble_probe/peer.py'

MS = 1_000_000
LED_PIN = 47
LINKED_NS = 1000 * MS
LED_ON_NS = 1_500_123_456
CHECK_ON_NS = 2000 * MS
LED_OFF_NS = 2_250_000_777
END_NS = 3000 * MS
BURST_NS = 3_500_000_333
BULK_DONE_NS = 5000 * MS
SCHEMA = {
    'actions': ['bulk', 'burst', 'fail', 'led_off', 'led_on'],
    'props': ['bulk_sent', 'burst_bad', 'burst_good', 'connected_ms', 'gaps', 'last_value', 'linked', 'mtu',
              'notifications', 'problem', 'problems', 'rx_octets', 'subscribed_ms', 'tx_octets', 'writes',
              'written_ms'],
}
NOTIFY_PERIOD_MS = 100
# The firmware sends a burst from the loop that paces COUNTER, which holds it
# for the burst (≈ 70 ms); each period also runs a little over 100 ms.
STRESS_PERIODS_LOST = 3
FRAMES = 20
MTU = 247
DATA_LENGTH_OCTETS = 251


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--transcript', default='/tmp/nrf52_ble_probe_transcript.jsonl')
    ap.add_argument('--worker', default=WORKER)
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()
    cfg = {'firmware_b64': fw_b64, 'machine': 'nrf52840-dk', 'grading': True,
           'watched_pins': list(range(48)), 'sensors': [],
           'ble': {'peer': PEER}}

    proc = subprocess.Popen(
        [sys.executable, args.worker],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
    )
    events: 'queue.Queue[dict]' = queue.Queue()
    transcript: list = []
    raw_lines: list = []  # the transcript as the worker wrote it

    def reader() -> None:
        for line in proc.stdout:
            raw_lines.append(line)
            ev = json.loads(line)
            transcript.append(ev)
            events.put(ev)

    reader_thread = threading.Thread(target=reader, daemon=True)
    reader_thread.start()

    def send(cmd: dict) -> None:
        proc.stdin.write(json.dumps(cmd) + '\n')
        proc.stdin.flush()

    def wait_for(type_: str, timeout: float = 120.0) -> dict:
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError(f'no {type_} within {timeout}s')
            try:
                ev = events.get(timeout=remaining)
            except queue.Empty:
                continue
            if ev['type'] == type_:
                return ev
            if ev['type'] == 'error':
                raise RuntimeError(f'worker error: {ev["message"]}')

    failures: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    requests = iter(range(1, 1000))

    def peer_state() -> dict:
        request = next(requests)
        send({'cmd': 'peer_state', 'id': request})
        ev = wait_for('peer_state')
        check(f'peer_state {request} answers its id', ev['id'] == request, f'id {ev["id"]}')
        if 'state' in ev:
            check(f'peer_state {request}: the phone found nothing wrong with the board', ev['state']['problems'] == 0,
                  ev['state']['problem'])
        return ev

    def peer_call(name: str) -> dict:
        request = next(requests)
        send({'cmd': 'peer_call', 'name': name, 'id': request})
        ev = wait_for('peer_result')
        check(f'peer_call {name} answers its id', ev['id'] == request, f'id {ev["id"]}')
        return ev

    def park(t_ns: int) -> None:
        w = time.perf_counter()
        send({'cmd': 'run_to', 't_ns': t_ns})
        ev = wait_for('run_stopped')
        check(f'park at {t_ns / MS} ms exact', ev['t_ns'] == t_ns,
              f'parked {ev["t_ns"]}, wall {time.perf_counter() - w:.2f}s')

    wall0 = time.perf_counter()
    send(cfg)
    booted = wait_for('system')
    check('booted with the peer schema', booted.get('peer') == SCHEMA, json.dumps(booted.get('peer')))
    print(f'[wall] booted after {time.perf_counter() - wall0:.2f}s')
    send({'cmd': 'run_to_app_start'})
    check('app_started at t_ns 0', wait_for('app_started')['t_ns'] == 0)

    park(LINKED_NS)
    linked = peer_state()['state']
    check('connected and subscribed by 1000 ms',
          linked['linked'] and 0 < linked['connected_ms'] < linked['subscribed_ms'] < LINKED_NS / MS, json.dumps(linked))

    park(LED_ON_NS)
    first, again = peer_state(), peer_state()
    check('peer_state twice at one park reads the same', first['state'] == again['state'], json.dumps(again))
    on_state = first['state']
    check('notifications in order, no gap',
          on_state['notifications'] > 0 and on_state['gaps'] == 0 and on_state['last_value'] == on_state['notifications'],
          json.dumps(on_state))
    unknown = peer_call('nope')
    check('an unknown action is refused', not unknown['ok'] and "unknown action 'nope'" in unknown.get('error', ''),
          unknown.get('error', ''))
    check('a refused action is not sticky', 'state' in peer_state())
    check('led_on accepted', peer_call('led_on')['ok'])

    park(CHECK_ON_NS)
    lit = peer_state()['state']
    check('the LED write is acknowledged once, after led_on',
          lit['writes'] == 1 and LED_ON_NS / MS < lit['written_ms'] < CHECK_ON_NS / MS, json.dumps(lit))

    park(LED_OFF_NS)
    check('led_off accepted', peer_call('led_off')['ok'])

    park(END_NS)
    end = peer_state()['state']
    check('the second write is acknowledged', end['writes'] == 2 and LED_OFF_NS / MS < end['written_ms'] < END_NS / MS,
          json.dumps(end))
    check(f'{DATA_LENGTH_OCTETS}-byte LL payloads both ways',
          end['tx_octets'] == end['rx_octets'] == DATA_LENGTH_OCTETS, json.dumps(end))
    expected = (END_NS - LED_ON_NS) / MS / NOTIFY_PERIOD_MS
    grown = end['notifications'] - on_state['notifications']
    check('about one notification per 100 ms, still in order',
          abs(grown - expected) <= 2 and end['gaps'] == 0 and end['last_value'] == end['notifications'],
          f'{grown} more, expected ≈ {expected:.1f}: {json.dumps(end)}')

    check('bulk accepted', peer_call('bulk')['ok'])
    park(BURST_NS)
    check('burst accepted', peer_call('burst')['ok'])
    park(BULK_DONE_NS)
    bulk = peer_state()['state']
    check('MTU 247, every bulk frame written, every burst frame back intact and in order',
          bulk['mtu'] == MTU and bulk['bulk_sent'] == FRAMES and bulk['burst_good'] == FRAMES and bulk['burst_bad'] == 0,
          json.dumps(bulk))
    check(f'still {DATA_LENGTH_OCTETS}-byte LL payloads both ways after the stress',
          bulk['tx_octets'] == bulk['rx_octets'] == DATA_LENGTH_OCTETS, json.dumps(bulk))
    expected = (BULK_DONE_NS - END_NS) / MS / NOTIFY_PERIOD_MS
    grown = bulk['notifications'] - end['notifications']
    check('COUNTER kept going through the stress, in order',
          expected - STRESS_PERIODS_LOST <= grown <= expected and bulk['gaps'] == 0
          and bulk['last_value'] == bulk['notifications'],
          f'{grown} more, expected {expected - STRESS_PERIODS_LOST:.0f}..{expected:.0f}: {json.dumps(bulk)}')

    failed = peer_call('fail')
    check('a raising action fails its peer_call',
          not failed['ok'] and 'action fail' in failed.get('error', '') and 'RuntimeError: probe fail' in failed['error'],
          failed.get('error', '')[:200])
    sticky_state = peer_state()
    check('the error fails peer_state after it', 'action fail' in sticky_state.get('error', ''), json.dumps(sticky_state)[:200])
    check('and peer_call after it', not peer_call('led_on')['ok'])

    send({'cmd': 'stop'})
    proc.wait(timeout=10)
    reader_thread.join(timeout=10)
    check('worker exited 0 on stop', proc.returncode == 0, f'rc={proc.returncode}')
    print(f'[wall] probe total {time.perf_counter() - wall0:.2f}s')

    edges = [e for e in transcript if e['type'] == 'gpio_change' and e['pin'] == LED_PIN]
    print('P1.15 edges:', ', '.join(f'{e["t_ns"] / MS:.3f} ms -> {e["state"]}' for e in edges))
    check('P1.15 rises once before the write is acknowledged and falls once after led_off',
          [e['state'] for e in edges] == [1, 0]
          and LED_ON_NS < edges[0]['t_ns'] < lit['written_ms'] * MS
          and LED_OFF_NS < edges[1]['t_ns'] < end['written_ms'] * MS)

    lines, cur, cur_t = [], bytearray(), None
    for e in transcript:
        if e['type'] != 'uart_tx_t' or e['uart'] != 0:
            continue
        if cur_t is None:
            cur_t = e['t_ns']
        if e['byte'] == 0x0A:
            lines.append((cur_t, cur.decode(errors='replace').rstrip('\r')))
            cur, cur_t = bytearray(), None
        else:
            cur.append(e['byte'])
    for t, text in lines:
        print(f'[serial] [{t / MS:9.3f} ms] {text}')
    texts = [text for _, text in lines]
    check('the board advertised, connected, saw the subscription and both writes',
          [t for t in texts if t in ('ADVERTISING', 'CONNECTED', 'NOTIFY ON', 'LED ON', 'LED OFF')]
          == ['ADVERTISING', 'CONNECTED', 'NOTIFY ON', 'LED ON', 'LED OFF'], repr(texts))
    check('no error or disconnect on the board',
          not any(t.startswith(('ERR', 'DISCONNECTED', 'CONNECT FAILED')) for t in texts))
    bulk_lines = [t for t in texts if t.startswith('BULK ')]
    check(f'the board got all {FRAMES} bulk frames intact',
          bulk_lines[-1:] == [f'BULK {FRAMES} good 0 bad'], repr(bulk_lines[-3:]))
    check(f'the board sent all {FRAMES} burst frames', f'BURST {FRAMES}/{FRAMES} sent' in texts)

    with open(args.transcript, 'w') as f:
        f.writelines(raw_lines)
    print(f'transcript: {len(transcript)} events -> {args.transcript}')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
