"""Determinism probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser), drives it over
stdin/stdout, and checks the run-to-virtual-time contract with the
blink_led_1hz gold, built by `run.sh` (1 Hz on P1.15 = global pin 47, starts ON, prints `LED ON` /
`LED OFF` per toggle):

  1. Booted parked: no guest events before the first run_to, clock at 0.
  2. run_to_app_start answers app_started with t_ns 0 (time origin = reset).
  3. Parks at 100 / 600 / 1100 / 1100.5 / 2000 virtual ms land exactly.
  4. set_pin while parked is acked by sync and does not advance the clock.
  5. P1.15 edges at ~0, ~500, ~1000, ~1500 ms (within 1 ms), none later than
     the 2000 ms park, and `LED ON` / `LED OFF` lines alternate.
  6. With P1.15 unwatched (watch_pins), its ~2000 / ~2500 ms edges are not
     reported; watching it again reports its level once, without t_ns, and
     the ~3000 ms edge is reported as before.
  7. The stamped transcript is written to --transcript; two runs must be
     byte-identical.

`--target nrf52840_arduino` runs that target's blink_led_1hz gold instead: its
setup() begins ~2.3 ms after reset, so edges are expected that much later, and
it prints nothing, so step 5's line check is skipped.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT (the worker reads both). Run with
py312_native's `python` (Homebrew python3 lacks pyrenode3).
Usage:
  python selftests/probes/nrf52840_zephyr/worker_probe.py --transcript /tmp/nrf1.jsonl
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
TASKS = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'tasks'))

MS = 1_000_000
LED_PIN = 47
BUTTON_PIN = 43
UART0_PINS = {5, 6}
PARKS_MS = (100, 600, 1100, 1100.5)
EXPECTED_EDGES_MS = (0, 500, 1000, 1500)
EDGE_TOL_NS = 1 * MS
# When each target's blink gold first drives P1.15, after reset.
ORIGIN_MS = {'nrf52840_zephyr': 0, 'nrf52840_arduino': 2.3}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--target', choices=tuple(ORIGIN_MS), default='nrf52840_zephyr')
    ap.add_argument('--firmware', help="default: the target's blink_led_1hz gold")
    ap.add_argument('--transcript', default='/tmp/nrf52_probe_transcript.jsonl')
    ap.add_argument('--worker', default=WORKER)
    args = ap.parse_args()
    firmware = args.firmware or os.path.join(TASKS, 'blink_led_1hz', args.target, 'compiled.elf')
    origin_ms = ORIGIN_MS[args.target]

    with open(firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()
    cfg = {'firmware_b64': fw_b64, 'machine': 'nrf52840-dk', 'grading': True,
           'watched_pins': list(range(48)), 'sensors': []}

    proc = subprocess.Popen(
        [sys.executable, args.worker],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
    )
    events: 'queue.Queue[dict]' = queue.Queue()
    transcript: list = []

    def reader() -> None:
        for line in proc.stdout:
            ev = json.loads(line)
            transcript.append(ev)
            events.put(ev)

    threading.Thread(target=reader, daemon=True).start()

    def send(cmd: dict) -> None:
        proc.stdin.write(json.dumps(cmd) + '\n')
        proc.stdin.flush()

    def wait_for(type_: str, timeout: float = 60.0) -> dict:
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

    wall0 = time.perf_counter()
    send(cfg)
    booted = wait_for('system', timeout=120.0)
    check('booted', booted['event'] == 'booted')
    print(f'[wall] booted after {time.perf_counter() - wall0:.2f}s')

    time.sleep(0.5)
    guest_pre = [e for e in transcript if e['type'] in ('uart_tx_t', 'gpio_change', 'app_started')]
    check('no guest events before first run_to', not guest_pre, f'{len(guest_pre)} events')
    send({'cmd': 'get_time'})
    t0 = wait_for('time')['t_ns']
    check('virtual clock at 0 before first run_to', t0 == 0, f't_ns={t0}')

    send({'cmd': 'run_to_app_start'})
    started = wait_for('app_started')
    check('app_started at t_ns 0 (time origin = reset)', started['t_ns'] == 0, f't_ns={started["t_ns"]}')

    for target_ms in PARKS_MS:
        target_ns = int(target_ms * MS)
        w = time.perf_counter()
        send({'cmd': 'run_to', 't_ns': target_ns})
        ev = wait_for('run_stopped')
        check(f'park at {target_ms} ms exact', ev['t_ns'] == target_ns,
              f'requested {target_ns}, parked {ev["t_ns"]}, wall {time.perf_counter() - w:.2f}s')

    send({'cmd': 'get_time'})
    a = wait_for('time')['t_ns']
    time.sleep(1.0)
    send({'cmd': 'get_time'})
    b = wait_for('time')['t_ns']
    check('clock frozen across 1 s wall sleep', a == b, f'{a} -> {b}')

    send({'cmd': 'set_pin', 'pin': BUTTON_PIN, 'value': True})
    send({'cmd': 'sync', 'id': 7})
    check('sync acks queued drive', wait_for('sync_done')['id'] == 7)
    send({'cmd': 'get_time'})
    c = wait_for('time')['t_ns']
    check('drive did not advance the clock', c == b, f'{b} -> {c}')

    send({'cmd': 'run_to', 't_ns': 2000 * MS})
    ev = wait_for('run_stopped')
    check('park at 2000 ms exact', ev['t_ns'] == 2000 * MS, f'parked {ev["t_ns"]}')
    by_2000 = len(transcript)

    send({'cmd': 'watch_pins', 'pins': [pin for pin in range(48) if pin != LED_PIN]})
    send({'cmd': 'run_to', 't_ns': 2700 * MS})
    wait_for('run_stopped')
    unwatched = [e for e in transcript[by_2000:] if e['type'] == 'gpio_change']
    check('no P1.15 edges while it is unwatched', not unwatched, repr(unwatched))
    by_2700 = len(transcript)
    send({'cmd': 'watch_pins', 'pins': list(range(48))})
    send({'cmd': 'sync', 'id': 8})
    wait_for('sync_done')
    catch_up = [e for e in transcript[by_2700:] if e['type'] == 'gpio_change']
    check('watching P1.15 again reports its OFF level once, without t_ns',
          catch_up == [{'type': 'gpio_change', 'pin': LED_PIN, 'state': 0}], repr(catch_up))
    send({'cmd': 'run_to', 't_ns': 3100 * MS})
    wait_for('run_stopped')
    rewatched = [e for e in transcript[by_2700:] if e['type'] == 'gpio_change' and 't_ns' in e]
    near_ms = origin_ms + 3000
    check(f'P1.15 ON edge near {near_ms:g} ms reported again',
          [(e['pin'], e['state']) for e in rewatched] == [(LED_PIN, 1)]
          and abs(rewatched[0]['t_ns'] - near_ms * MS) <= EDGE_TOL_NS, repr(rewatched))

    send({'cmd': 'stop'})
    proc.wait(timeout=10)
    check('worker exited 0 on stop', proc.returncode == 0, f'rc={proc.returncode}')
    print(f'[wall] probe total {time.perf_counter() - wall0:.2f}s')

    edges = [e for e in transcript[:by_2000] if e['type'] == 'gpio_change' and e['pin'] == LED_PIN]
    print('P1.15 edges:', ', '.join(f'{e["t_ns"] / MS:.3f} ms -> {e["state"]}' for e in edges))
    check('four P1.15 edges by the 2000 ms park', len(edges) == len(EXPECTED_EDGES_MS),
          f'{len(edges)} edges')
    for expected_ms, e in zip(EXPECTED_EDGES_MS, edges):
        near_ms = origin_ms + expected_ms
        check(f'P1.15 edge near {near_ms:g} ms', abs(e['t_ns'] - near_ms * MS) <= EDGE_TOL_NS,
              f'{e["t_ns"] / MS:.3f} ms')
    check('P1.15 starts ON and alternates', [e['state'] for e in edges] == [1, 0, 1, 0][:len(edges)])
    other = [e for e in transcript if e['type'] == 'gpio_change' and e['pin'] != LED_PIN]
    check('only UART0 TXD/RTS (P0.06/P0.05) move besides the LED, and only at boot',
          all(e['pin'] in UART0_PINS and e['t_ns'] < (origin_ms + 1) * MS for e in other),
          f'{len(other)} events on {sorted({e["pin"] for e in other})}')

    stamped = [e for e in transcript if e['type'] == 'uart_tx_t']
    check('uart_tx_t timestamps monotonic', all(x['t_ns'] <= y['t_ns'] for x, y in zip(stamped, stamped[1:])))
    lines, cur, cur_t = [], bytearray(), None
    for e in stamped:
        if cur_t is None:
            cur_t = e['t_ns']
        if e['byte'] == 0x0A:
            lines.append((cur_t, cur.decode(errors='replace').rstrip('\r')))
            cur, cur_t = bytearray(), None
        else:
            cur.append(e['byte'])
    for t, text in lines:
        print(f'[serial] [{t / MS:9.3f} ms] {text}')
    if args.target == 'nrf52840_zephyr':
        led_lines = [text for t, text in lines if text.startswith('LED ') and t < 2000 * MS]
        check('LED lines alternate ON/OFF and match the edges',
              led_lines == ['LED ON', 'LED OFF', 'LED ON', 'LED OFF'], repr(led_lines))

    with open(args.transcript, 'w') as f:
        for ev in transcript:
            f.write(json.dumps(ev, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} events -> {args.transcript}')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
