"""Clock-drift probe for the ESP32 grading worker.

Guards the systimer's ns->tick conversion. The counter runs at 16 MHz, so one
tick is 62.5 ns and the conversion truncates; the conversion used to drop that
sub-tick remainder on every update. Because the loss is per-*read* rather than
per-unit-time, a guest busy-polling esp_timer_get_time() (~139 reads/ms) ran
~0.43% slow — +43 us per 10 ms period, ~13 ms by t=3000 — while a firmware that
yielded stayed exact. That shifted a correct sketch past the >=10 ms assertion
margin and failed it. Fixed in the fork's esp_systimer.c by carrying the
sub-tick remainder across updates (commit b1062b8d).

Neither worker_probe.py nor compare_transcripts.py catches this: both pass on
the drifting binary, because the error lives only in gpio_change edge spacing,
which nothing else asserts.

The fixture (fixtures/busy_poll/) is the sampling-grain gold with its
vTaskDelay(1) removed — the worst case for read frequency. Its firmware toggles
GPIO 10 every 10 ms off a t0 captured at app start, so the edge spacing is a
direct read of the guest clock's rate against the virtual clock.

Assertions are on the *period*, not on absolute edge times: the ~0.46 ms
app-start anchor gap is expected and documented (anchor_probe.py), so folding it
into the drift measurement would be wrong.

Usage:
  python3 selftests/probes/esp32s3_espidf/drift_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/fixtures/busy_poll/compiled.bin
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

LED_PIN = 10
PERIOD_MS = 10.0
RUN_TO_MS = 2000

# The bug was 43 us/period (0.43%); the fix measures 0.000%. 5 us (0.05%) sits
# an order of magnitude below the bug and well above the ~0.1 us of run-to-run
# noise, so it catches a regression without being flaky.
PERIOD_TOLERANCE_MS = 0.005
# Over ~200 edges the bug accumulated ~9 ms, which is what actually pushes a
# task assertion past its margin. Bound the total, not just the rate.
ACCUM_TOLERANCE_MS = 1.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--machine', default='esp32s3-picsimlab')
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

    send({'cmd': 'run_to_app_start'})
    app_ns = wait_for('app_started', timeout=120.0)['t_ns']

    # run_to takes absolute virtual time (from power-on), while the edges below
    # are rebased to app start — so the ~500 ms of ROM+bootloader has to be
    # added or the run ends that much short of RUN_TO_MS of app time.
    send({'cmd': 'run_to', 't_ns': app_ns + RUN_TO_MS * MS})
    wait_for('run_stopped', timeout=300.0)
    # run_stopped is a barrier on the worker's stdout, but the reader thread
    # here still has the backlog of gpio_change lines to parse. Wait for the
    # count to stop growing, or the tail of the run goes missing.
    stable = 0
    seen = -1
    while stable < 3:
        time.sleep(0.2)
        now = len(transcript)
        stable = stable + 1 if now == seen else 0
        seen = now

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    edges = [(e['t_ns'] - app_ns) / 1e6 for e in transcript
             if e.get('type') == 'gpio_change'
             and e.get('pin') == LED_PIN and 't_ns' in e]

    # A firmware that never toggled would otherwise "pass" every rate check
    # below on an empty list.
    expected = RUN_TO_MS / PERIOD_MS
    check('enough edges to measure a rate', len(edges) > expected * 0.9,
          f'{len(edges)} edges over {RUN_TO_MS} ms')
    if len(edges) < 3:
        print('PROBE FAIL (too few edges to measure drift)')
        return 1

    # Edge 0 is the initial gpio_set_level at app start, not a grid crossing —
    # measure from edge 1 so the anchor gap stays out of the rate.
    span = edges[-1] - edges[1]
    period = span / (len(edges) - 2)
    drift_pct = 100.0 * (period - PERIOD_MS) / PERIOD_MS
    check(f'mean period is {PERIOD_MS} ms',
          abs(period - PERIOD_MS) <= PERIOD_TOLERANCE_MS,
          f'{period:.6f} ms ({drift_pct:+.4f}%)')

    # Accumulated error relative to the grid the first real edge sets up.
    accum = edges[-1] - (edges[1] + PERIOD_MS * (len(edges) - 2))
    check('accumulated error bounded over the run',
          abs(accum) <= ACCUM_TOLERANCE_MS,
          f'{accum:+.4f} ms over {len(edges) - 2} periods')

    # A rate that is right on average can still wander. Bound the worst single
    # period so a drift that cancels out cannot hide.
    deltas = [b - a for a, b in zip(edges[1:], edges[2:])]
    worst = max(abs(d - PERIOD_MS) for d in deltas)
    check('no single period off the grid',
          worst <= PERIOD_TOLERANCE_MS * 2,
          f'worst {worst * 1000:.1f} us')

    print(f'edges: {len(edges)}  first: '
          f'{", ".join(f"{t:.4f}" for t in edges[:4])}')
    print(f'period {period:.6f} ms, drift {drift_pct:+.4f}%, '
          f'accum {accum:+.4f} ms')

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
