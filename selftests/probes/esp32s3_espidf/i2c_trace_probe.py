"""I2C event-volume probe for the ESP32 grading worker.

The worker used to log and emit an `i2c_trace` event for every I2C event, which
nothing in grading reads. A firmware polling a sensor makes ~10^5 of them per
virtual second, all relayed through the backend to the browser. This probe
runs the hmc5883l_raw_axis_read reference with the compass attached, prints
the events by type, and requires readings on the serial console with no
`i2c_trace` events.

Usage:
  python3 selftests/probes/esp32s3_espidf/i2c_trace_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware tasks/hmc5883l_raw_axis_read/esp32s3_espidf/compiled.bin
Exit 0 = all checks pass.
"""
import argparse
import base64
import collections
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', '..', '..', 'velxio', 'backend', 'app',
                      'services', 'esp32_worker.py')

MS = 1_000_000  # ns per ms

RUN_MS = 2500
COMPASS = {'sensor_type': 'hmc5883l', 'pin': 200 + 0x1e, 'addr': 0x1e,
           'sda_pin': 38, 'scl_pin': 39,
           'magneticX': 0.2, 'magneticY': -0.1, 'magneticZ': 0.4}


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
        'sensors': [COMPASS],
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

    counts: collections.Counter = collections.Counter()
    serial = bytearray()

    def wait_for(type_: str, timeout: float) -> dict | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                ev = events.get(timeout=deadline - time.time())
            except queue.Empty:
                break
            counts[ev['type']] += 1
            if ev['type'] == 'uart_tx_t' and ev.get('uart', 0) == 0:
                serial.append(ev['byte'])
            if ev['type'] == type_:
                return ev
            if ev['type'] == 'error':
                raise RuntimeError(f'worker error: {ev.get("message")}')
        return None

    send(cfg)
    if wait_for('system', 60.0) is None:
        raise TimeoutError('worker did not boot')
    send({'cmd': 'run_to_app_start'})
    started = wait_for('app_started', 120.0)
    if started is None:
        raise TimeoutError('no app_started')
    t0 = time.time()
    send({'cmd': 'run_to', 't_ns': started['parked_ns'] + RUN_MS * MS})
    if wait_for('run_stopped', 300.0) is None:
        raise TimeoutError('run_to never parked')
    wall = time.time() - t0
    proc.kill()

    print(f'{RUN_MS} virtual ms in {wall:.1f} s wall; events by type:')
    for type_, n in counts.most_common():
        print(f'  {n:8d}  {type_}')

    readings = [line for line in serial.decode(errors='replace').splitlines()
                if re.fullmatch(r'X: -?\d+ Y: -?\d+ Z: -?\d+\r?', line)]
    failures = []
    if not readings:
        failures.append('no compass readings on the serial console')
    if counts['i2c_trace']:
        failures.append(f'{counts["i2c_trace"]} i2c_trace events in grading')
    for failure in failures:
        print(f'[FAIL] {failure}')
    if not failures:
        print(f'[PASS] {len(readings)} readings, no i2c_trace events')
    print('PROBE ' + ('FAIL' if failures else 'PASS'))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
