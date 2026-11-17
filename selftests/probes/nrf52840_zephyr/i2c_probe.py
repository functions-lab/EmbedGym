"""I2C path probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser) with an MPU6050
declared in the start config, and drives the mpu6050 selftest firmware
(Zephyr's own mpu6050 driver on i2c0, printing raw counts every 200 ms):

  1. Booted parked with the sensor attached; no guest events before run_to.
  2. By 400 ms the firmware has read the model's defaults: aZ 16384, rest 0,
     so the driver's chip-id / PWR_MGMT_1 / config writes all went through.
  3. sensor_update while parked (accelZ 1, accelX 0.5, gyroY 100) is acked by
     sync; by 1500 ms the last line reads aX 8192 aZ 16384 gY 13100 and no line
     printed after the drive still shows the old values.
  4. sensor_detach unregisters the slave: every read after it fails.
  5. The stamped transcript is written to --transcript; two runs must be
     byte-identical.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT (the worker reads both). Run with
py312_native's `python` (Homebrew python3 lacks pyrenode3).
Usage:
  python selftests/probes/nrf52840_zephyr/i2c_probe.py --transcript /tmp/nrf_i2c1.jsonl
Exit 0 = all checks pass.
"""
import argparse
import base64
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'velxio', 'backend', 'app', 'services', 'nrf52_worker.py'))
FIRMWARE = os.path.normpath(os.path.join(
    HERE, '..', '..', 'parts', 'wokwi-mpu6050', 'nrf52840_zephyr', 'compiled.elf'))

MS = 1_000_000
MPU_ADDR = 0x68
MPU_PIN = 200 + MPU_ADDR
LINE_RE = re.compile(r'^aX: (-?\d+) aY: (-?\d+) aZ: (-?\d+) gX: (-?\d+) gY: (-?\d+) gZ: (-?\d+)$')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--firmware', default=FIRMWARE)
    ap.add_argument('--transcript', default='/tmp/nrf52_i2c_probe_transcript.jsonl')
    ap.add_argument('--worker', default=WORKER)
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()
    cfg = {'firmware_b64': fw_b64, 'machine': 'nrf52840-dk', 'grading': True,
           'watched_pins': list(range(48)),
           'sensors': [{'sensor_type': 'mpu6050', 'pin': MPU_PIN, 'addr': MPU_ADDR}]}

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

    def run_to(target_ms: float) -> None:
        target_ns = int(target_ms * MS)
        send({'cmd': 'run_to', 't_ns': target_ns})
        ev = wait_for('run_stopped')
        check(f'park at {target_ms} ms exact', ev['t_ns'] == target_ns, f'parked {ev["t_ns"]}')

    def serial_lines() -> list:
        lines, cur, cur_t = [], bytearray(), None
        for e in transcript:
            if e['type'] != 'uart_tx_t':
                continue
            if cur_t is None:
                cur_t = e['t_ns']
            if e['byte'] == 0x0A:
                lines.append((cur_t, cur.decode(errors='replace').rstrip('\r')))
                cur, cur_t = bytearray(), None
            else:
                cur.append(e['byte'])
        return lines

    def readings(lines: list) -> list:
        out = []
        for t, text in lines:
            m = LINE_RE.match(text)
            if m:
                out.append((t, tuple(int(v) for v in m.groups())))
        return out

    wall0 = time.perf_counter()
    send(cfg)
    booted = wait_for('system', timeout=120.0)
    check('booted', booted['event'] == 'booted')
    print(f'[wall] booted after {time.perf_counter() - wall0:.2f}s')

    time.sleep(0.5)
    guest_pre = [e for e in transcript if e['type'] in ('uart_tx_t', 'gpio_change')]
    check('no guest events before first run_to', not guest_pre, f'{len(guest_pre)} events')

    send({'cmd': 'run_to_app_start'})
    check('app_started at t_ns 0', wait_for('app_started')['t_ns'] == 0)

    run_to(400)
    first = readings(serial_lines())
    check('firmware read the model defaults by 400 ms', len(first) >= 1, f'{len(first)} readings')
    if first:
        check('default reading is aZ 16384, everything else 0',
              first[0][1] == (0, 0, 16384, 0, 0, 0), repr(first[0][1]))
    check('no failure text on serial', not any('failed' in t or 'not ready' in t for _, t in serial_lines()))

    run_to(500)
    send({'cmd': 'sensor_update', 'pin': MPU_PIN, 'accelZ': 1})
    send({'cmd': 'sync', 'id': 1})
    check('sync acks the queued sensor_update', wait_for('sync_done')['id'] == 1)
    run_to(600)
    send({'cmd': 'sensor_update', 'pin': MPU_PIN, 'accelX': 0.5})
    run_to(700)
    send({'cmd': 'sensor_update', 'pin': MPU_PIN, 'gyroY': 100})
    run_to(1500)

    after = [r for r in readings(serial_lines()) if r[0] > 700 * MS]
    check('readings printed after the last drive', len(after) >= 1, f'{len(after)} readings')
    check('every reading after 700 ms shows aX 8192 aZ 16384 gY 13100',
          all(v == (8192, 0, 16384, 0, 13100, 0) for _, v in after),
          ', '.join(f'{t / MS:.1f}ms {v}' for t, v in after))
    count = len(readings(serial_lines()))
    check('reading count matches the 200 ms cadence by 1500 ms', 6 <= count <= 9, f'{count} readings')

    send({'cmd': 'sensor_detach', 'pin': MPU_PIN})
    send({'cmd': 'sync', 'id': 2})
    check('sync acks the queued sensor_detach', wait_for('sync_done')['id'] == 2)
    run_to(2500)
    late_ok = [r for r in readings(serial_lines()) if r[0] > 1600 * MS]
    late_fail = [t for t, text in serial_lines() if t > 1600 * MS and text == 'MPU6050 fetch failed']
    check('no reading after detach', not late_ok, f'{len(late_ok)} readings')
    check('reads fail after detach', len(late_fail) >= 3, f'{len(late_fail)} failures')

    send({'cmd': 'stop'})
    proc.wait(timeout=10)
    check('worker exited 0 on stop', proc.returncode == 0, f'rc={proc.returncode}')
    print(f'[wall] probe total {time.perf_counter() - wall0:.2f}s')

    for t, text in serial_lines():
        print(f'[serial] [{t / MS:9.3f} ms] {text}')

    with open(args.transcript, 'w') as f:
        for ev in transcript:
            f.write(json.dumps(ev, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} events -> {args.transcript}')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
