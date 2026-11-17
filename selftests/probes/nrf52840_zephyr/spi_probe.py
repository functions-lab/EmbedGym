"""SPI path probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser) with a BME280 declared
in the start config on SPI, CS on P1.14, and drives the bme280-spi selftest
firmware (Zephyr's own bme280 driver on spi0 as `nordic,nrf-spim`, printing
`T= P= H=` every 200 ms):

  1. Booted parked with the sensor attached; no guest events before run_to.
  2. By 400 ms the firmware has read the model's defaults, 25.0 °C and 50.0 %RH:
     the SPIM was mapped over twi0 at the driver's first ENABLE write, with the
     configuration written before it, and chip id, calibration and ctrl writes
     all went through CS-framed transfers.
  3. sensor_update while parked (temperature, pressure, humidity) is acked by
     sync; lines printed after the last drive move monotonically to the driven
     values and reach them once the driver's IIR filter (coefficient 4) settles.
  4. sensor_detach leaves MISO at 0: no later line shows the driven values.
  5. The stamped transcript is written to --transcript; two runs must be
     byte-identical.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT (the worker reads both). Run with
py312_native's `python` (Homebrew python3 lacks pyrenode3).
Usage:
  python selftests/probes/nrf52840_zephyr/spi_probe.py --transcript /tmp/nrf_spi1.jsonl
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
    HERE, '..', '..', 'parts', 'velxio-bme280-spi', 'nrf52840_zephyr', 'compiled.elf'))

MS = 1_000_000
CS_PIN = 32 + 14  # P1.14
LINE_RE = re.compile(r'^T=(-?\d+\.\d) P=(-?\d+\.\d) H=(-?\d+\.\d)$')
DRIVEN = (30.0, 1000.0, 80.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--firmware', default=FIRMWARE)
    ap.add_argument('--transcript', default='/tmp/nrf52_spi_probe_transcript.jsonl')
    ap.add_argument('--worker', default=WORKER)
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()
    cfg = {'firmware_b64': fw_b64, 'machine': 'nrf52840-dk', 'grading': True,
           'watched_pins': list(range(48)),
           'sensors': [{'sensor_type': 'bme280', 'pin': CS_PIN, 'transport': 'spi'}]}

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
                out.append((t, tuple(float(v) for v in m.groups())))
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
        check('default reading is 25.0 °C, 50.0 %RH', (first[0][1][0], first[0][1][2]) == (25.0, 50.0), repr(first[0][1]))
    check('no failure text on serial', not any('failed' in t or 'not ready' in t for _, t in serial_lines()))
    cs_edges = [e for e in transcript if e['type'] == 'gpio_change' and e['pin'] == CS_PIN]
    check('CS frames the transfers', len(cs_edges) >= 4 and cs_edges[0]['state'] == 1, f'{len(cs_edges)} edges')

    run_to(500)
    send({'cmd': 'sensor_update', 'pin': CS_PIN, 'temperature': DRIVEN[0]})
    send({'cmd': 'sync', 'id': 1})
    check('sync acks the queued sensor_update', wait_for('sync_done')['id'] == 1)
    run_to(600)
    send({'cmd': 'sensor_update', 'pin': CS_PIN, 'pressure': DRIVEN[1]})
    run_to(700)
    send({'cmd': 'sensor_update', 'pin': CS_PIN, 'humidity': DRIVEN[2]})
    run_to(1500)
    count = len(readings(serial_lines()))
    check('reading count matches the 200 ms cadence by 1500 ms', 5 <= count <= 9, f'{count} readings')
    # The IIR filter closes 1/4 of the gap per measurement: a 5 °C / 13.2 hPa step settles to one decimal in ~20.
    run_to(7000)

    # A measurement running at the drive still carries the old value: x16 oversampling plus standby is under 200 ms.
    after = [r for r in readings(serial_lines()) if r[0] > 900 * MS]
    shown = ', '.join(f'{t / MS:.1f}ms {v}' for t, v in after[:3]) + f' … {after[-1][1] if after else None}'
    check('readings printed after the last drive', len(after) >= 2, f'{len(after)} readings')
    check('temperature rises and pressure falls toward the drive',
          all(a[1][0] <= b[1][0] and a[1][1] >= b[1][1] for a, b in zip(after, after[1:])), shown)
    check(f'the settled reading shows {DRIVEN}', bool(after) and after[-1][1] == DRIVEN, shown)

    send({'cmd': 'sensor_detach', 'pin': CS_PIN})
    send({'cmd': 'sync', 'id': 2})
    check('sync acks the queued sensor_detach', wait_for('sync_done')['id'] == 2)
    run_to(8000)
    late = [r for r in readings(serial_lines()) if r[0] > 7200 * MS]
    check('no driven reading after detach', all(v != DRIVEN for _, v in late), repr(late[:2]))

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
