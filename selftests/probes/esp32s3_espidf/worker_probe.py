"""M1 determinism probe for the ESP32 grading worker.

Spawns esp32_worker.py directly (no backend, no browser) in grading mode,
drives it over stdin/stdout, and checks the run-to-virtual-time contract:

  1. -S start: no guest events (uart_tx_t / gpio_change) before the first
     run_to, only the 'booted' handshake.
  1b. run_to_app_start parks on the firmware's app-start marker, reports it
     once, and the marker bytes never reach the UART stream.
  2. Parks at 600 / 750 / 1250 / 2000 virtual ms land exactly on the request.
  3. The virtual clock is frozen while parked (1 s wall sleep, zero drift).
  4. set_pin while parked is acked by sync and does not resume the guest.
  5. The full event transcript is written to --transcript; two runs of this
     probe must produce byte-identical transcripts (the determinism gate).

Usage:
  python3 selftests/probes/esp32s3_espidf/worker_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware <merged.bin> [--machine esp32s3-picsimlab] \
      --transcript /tmp/t1.jsonl
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

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', '..', '..', 'velxio', 'backend', 'app',
                      'services', 'esp32_worker.py')

MS = 1_000_000  # ns per ms


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--machine', default='esp32s3-picsimlab')
    ap.add_argument('--transcript', default='/tmp/esp32_probe_transcript.jsonl')
    ap.add_argument('--worker', default=os.path.normpath(WORKER))
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()

    cfg = {
        'lib_path': os.path.abspath(args.lib),
        'firmware_b64': fw_b64,
        'machine': args.machine,
        'sensors': [],
        'wifi_enabled': False,
        'grading': True,
        'watched_pins': list(range(49)),
    }

    proc = subprocess.Popen(
        [sys.executable, args.worker],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, bufsize=1,
    )
    events: 'queue.Queue[dict]' = queue.Queue()
    transcript: list = []

    def reader() -> None:
        for line in proc.stdout:
            idx = line.find('{"type":')
            if idx < 0:
                continue
            try:
                ev = json.loads(line[idx:].strip())
            except Exception:
                continue
            transcript.append(ev)
            events.put(ev)

    threading.Thread(target=reader, daemon=True).start()

    def send(cmd: dict) -> None:
        proc.stdin.write(json.dumps(cmd) + '\n')
        proc.stdin.flush()

    def wait_for(type_: str, timeout: float = 30.0) -> dict:
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError(f'no {type_} within {timeout}s')
            try:
                ev = events.get(timeout=remaining)
            except queue.Empty:
                continue
            if ev.get('type') == type_:
                return ev
            if ev.get('type') == 'error':
                raise RuntimeError(f'worker error: {ev.get("message")}')

    failures: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    send(cfg)
    wait_for('system', timeout=60.0)  # {'event': 'booted'}

    # 1: -S means nothing ran yet — settle, then assert no guest events.
    time.sleep(1.0)
    guest_pre = [e for e in transcript
                 if e.get('type') in ('uart_tx_t', 'uart_tx', 'gpio_change',
                                      'app_started')]
    check('no guest events before first run_to', not guest_pre,
          f'{len(guest_pre)} events' if guest_pre else '')
    send({'cmd': 'get_time'})
    t0 = wait_for('time')['t_ns']
    check('virtual clock at 0 before first run_to', t0 == 0, f't_ns={t0}')

    # 1b: app-start handshake. Must run before any run_to — it can only be
    # answered while the marker is still ahead of the guest.
    send({'cmd': 'run_to_app_start'})
    started = wait_for('app_started', timeout=120.0)
    app_ns = started['t_ns']
    check('app start within 100 ms - 2 s of virtual time',
          100 * MS <= app_ns <= 2000 * MS, f't_ns={app_ns}')
    check('parked at or just after app start',
          app_ns <= started['parked_ns'] <= app_ns + MS,
          f'app {app_ns}, parked {started["parked_ns"]}')

    # 2: parks land exactly on the request.
    for target_ms in (600, 750, 1250, 2000):
        send({'cmd': 'run_to', 't_ns': target_ms * MS})
        ev = wait_for('run_stopped', timeout=120.0)
        check(f'park at {target_ms} ms exact', ev['t_ns'] == target_ms * MS,
              f'requested {target_ms * MS}, parked {ev["t_ns"]}')

    # 2b: a repeat run_to for an already-reached time re-reports the same
    # park. Reading the virtual clock instead would report the ~0.9 ms
    # post-stop overshoot as the park time, shifting every row that shares
    # an `at` with the row before it.
    send({'cmd': 'run_to', 't_ns': 2000 * MS})
    repeat = wait_for('run_stopped', timeout=120.0)
    check('repeat park at a reached time is exact',
          repeat['t_ns'] == 2000 * MS,
          f'requested {2000 * MS}, parked {repeat["t_ns"]}')

    # 3: clock frozen while parked.
    send({'cmd': 'get_time'})
    a = wait_for('time')['t_ns']
    time.sleep(1.0)
    send({'cmd': 'get_time'})
    b = wait_for('time')['t_ns']
    check('clock frozen across 1 s wall sleep', a == b, f'{a} -> {b}')

    # 4: drive while parked, ack via sync, still parked after.
    send({'cmd': 'set_pin', 'pin': 4, 'value': 1})
    send({'cmd': 'sync', 'id': 7})
    ev = wait_for('sync_done')
    check('sync acks queued drive', ev.get('id') == 7)
    send({'cmd': 'get_time'})
    c = wait_for('time')['t_ns']
    check('drive did not advance the clock', c == b, f'{b} -> {c}')

    # One more park so serial from the blink window lands in the transcript.
    send({'cmd': 'run_to', 't_ns': 2500 * MS})
    wait_for('run_stopped', timeout=120.0)

    starts = [e for e in transcript if e.get('type') == 'app_started']
    check('exactly one app_started', len(starts) == 1, f'{len(starts)} events')

    stamped = [e for e in transcript if e.get('type') == 'uart_tx_t']
    check('stamped serial arrived', len(stamped) > 0, f'{len(stamped)} bytes')
    unstamped = [e for e in transcript if e.get('type') == 'uart_tx']
    check('no unstamped uart_tx in grading mode', not unstamped)
    in_order = all(a['t_ns'] <= b['t_ns'] for a, b in zip(stamped, stamped[1:]))
    check('uart_tx_t timestamps monotonic', in_order)

    text = bytes(e['byte'] for e in stamped if e.get('uart') == 0)
    check('app-start marker stripped from UART0', b'VLX-APP' not in text)

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    with open(args.transcript, 'w') as f:
        for ev in transcript:
            f.write(json.dumps(ev, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} events -> {args.transcript}')

    tail = text.decode('utf-8', errors='replace').strip().splitlines()
    print('last serial lines:', tail[-3:] if tail else '(none)')

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
