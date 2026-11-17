"""watch_pins probe for the ESP32 grading worker: gpio_change goes out only for
the pins the browser watches.

Runs the esp32s3_espidf blink_led_1hz gold (GPIO 10 ON at app start, toggled
every 500 ms), started with no watched pins:

  1. No gpio_change through app start + 1200 ms.
  2. watch_pins [10] reports GPIO 10 once at its level (ON since ~1000 ms),
     without t_ns.
  3. The ~1500 ms OFF edge is reported with t_ns.
  4. Watching GPIO 4 too reports nothing: it never changed.
  5. watch_pins [] stops the reports: nothing for the ~2000 ms edge.

Usage:
  python3 selftests/probes/esp32s3_espidf/watch_pins_probe.py --lib <libqemu-xtensa.(so|dylib)> \\
      --firmware tasks/blink_led_1hz/esp32s3_espidf/compiled.bin
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
UNUSED_PIN = 4
EDGE_TOL_NS = 10 * MS


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--machine', default='esp32s3-picsimlab')
    ap.add_argument('--worker', default=os.path.normpath(WORKER))
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()

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
            ev = json.loads(line[idx:].strip())
            transcript.append(ev)
            events.put(ev)

    threading.Thread(target=reader, daemon=True).start()

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
            if ev.get('type') == type_:
                return ev
            if ev.get('type') == 'error':
                raise RuntimeError(f'worker error: {ev.get("message")}')

    def gpio_changes(since: int) -> list:
        return [e for e in transcript[since:] if e.get('type') == 'gpio_change']

    def run_to(t_ns: int) -> int:
        send({'cmd': 'run_to', 't_ns': t_ns})
        wait_for('run_stopped')
        return len(transcript)

    def watch(pins: list, sync_id: int) -> int:
        since = len(transcript)
        send({'cmd': 'watch_pins', 'pins': pins})
        send({'cmd': 'sync', 'id': sync_id})
        wait_for('sync_done')
        return since

    failures: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    send({
        'lib_path': os.path.abspath(args.lib),
        'firmware_b64': fw_b64,
        'machine': args.machine,
        'sensors': [],
        'wifi_enabled': False,
        'grading': True,
        'watched_pins': [],
    })
    wait_for('system', timeout=60.0)  # {'event': 'booted'}
    send({'cmd': 'run_to_app_start'})
    app_ns = wait_for('app_started')['t_ns']

    run_to(app_ns + 1200 * MS)
    unwatched = gpio_changes(0)
    check('no gpio_change while nothing is watched', not unwatched, f'{len(unwatched)} events')

    since = watch([LED_PIN], 1)
    catch_up = gpio_changes(since)
    check('watching GPIO 10 reports its ON level once, without t_ns',
          catch_up == [{'type': 'gpio_change', 'pin': LED_PIN, 'state': 1}], repr(catch_up))

    since = len(transcript)
    run_to(app_ns + 1700 * MS)
    edges = gpio_changes(since)
    check('the ~1500 ms OFF edge is reported with t_ns',
          [(e['pin'], e['state']) for e in edges] == [(LED_PIN, 0)]
          and abs(edges[0]['t_ns'] - (app_ns + 1500 * MS)) <= EDGE_TOL_NS,
          repr(edges))

    since = watch([LED_PIN, UNUSED_PIN], 2)
    check('watching a pin that never changed reports nothing', not gpio_changes(since),
          repr(gpio_changes(since)))

    since = watch([], 3)
    run_to(app_ns + 2200 * MS)
    check('no report for the ~2000 ms edge once unwatched', not gpio_changes(since),
          repr(gpio_changes(since)))

    send({'cmd': 'stop'})
    proc.wait(timeout=30)
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
