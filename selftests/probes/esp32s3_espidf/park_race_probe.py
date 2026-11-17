"""Back-to-back park probe for the ESP32 grading worker.

On a busy guest the park timer fires on the vCPU thread, where qmp_stop only
requests the stop and the main loop completes it later. The worker used to
report run_stopped at the request; a run_to arriving before the main loop
completed the stop then resumed nothing, and the clock froze for good. This
probe sends each run_to the instant the previous run_stopped arrives, on the
busy_poll fixture, and requires every park to land.

Usage:
  python3 selftests/probes/esp32s3_espidf/park_race_probe.py --lib <libqemu-xtensa.(so|dylib)> \
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

PARKS = 300
# Unfixed, the clock froze within ~20 parks; a fixed park takes ~6 ms of wall time.
PARK_TIMEOUT_S = 15.0


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

    def reader() -> None:
        for line in proc.stdout:
            idx = line.find('{"type":')
            if idx >= 0:
                events.put(json.loads(line[idx:]))

    threading.Thread(target=reader, daemon=True).start()

    def send(cmd: dict) -> None:
        proc.stdin.write(json.dumps(cmd) + '\n')
        proc.stdin.flush()

    def wait_for(type_: str, timeout: float) -> dict | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                ev = events.get(timeout=deadline - time.time())
            except queue.Empty:
                break
            if ev.get('type') == type_:
                return ev
            if ev.get('type') == 'error':
                raise RuntimeError(f'worker error: {ev.get("message")}')
        return None

    send(cfg)
    if wait_for('system', 60.0) is None:
        raise TimeoutError('worker did not boot')
    send({'cmd': 'run_to_app_start'})
    started = wait_for('app_started', 120.0)
    if started is None:
        raise TimeoutError('no app_started')

    target = started['parked_ns']
    failure = None
    for k in range(PARKS):
        target += MS
        send({'cmd': 'run_to', 't_ns': target})
        ev = wait_for('run_stopped', PARK_TIMEOUT_S)
        if ev is None:
            send({'cmd': 'get_time'})
            now = wait_for('time', 5.0)
            failure = f'park {k} at {target} never landed; clock at {now and now["t_ns"]}'
            break
        if ev['t_ns'] != target:
            failure = f'park {k} landed at {ev["t_ns"]}, requested {target}'
            break

    proc.kill()
    print(f'[{"FAIL" if failure else "PASS"}] {PARKS} back-to-back 1 ms parks land'
          + (f' — {failure}' if failure else ''))
    print('PROBE ' + ('FAIL' if failure else 'PASS'))
    return 1 if failure else 0


if __name__ == '__main__':
    sys.exit(main())
