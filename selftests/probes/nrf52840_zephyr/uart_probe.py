"""Second-UART probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser) with a PA1616S declared
in the start config on P1.01 (module TX) / P1.02 (module RX), and drives the
pa1616s selftest firmware (uart1 interrupt-driven at 9600 baud; sends PMTK314
RMC+GGA and PMTK220 at boot, prints one `FIX …` line per parsed sentence):

  1. Booted parked; no guest events before run_to.
  2. The firmware's two PMTK commands leave uart1 as stamped `uart_tx_t` events
     with `uart: 1`; none of their bytes show on uart0.
  3. The first burst starts at 1000 ms and arrives one 10-bit frame per byte:
     the first `FIX 0` prints when the GGA sentence's last byte lands.
  4. sensor_update (fix, latitude, longitude) while parked shows in the next
     burst and in none before it.
  5. `uart_send` on uart 1 is paced the same way.
  6. sensor_detach stops the bursts.
  7. The stamped transcript is written to --transcript; two runs must be
     byte-identical.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT (the worker reads both). Run with
py312_native's `python` (Homebrew python3 lacks pyrenode3). The probe imports
`embedgym_parts.pa1616s` from the repo's `parts/`; copied out of the repo it needs
`PYTHONPATH=<repo>/parts` next to `--worker`.
Usage:
  python selftests/probes/nrf52840_zephyr/uart_probe.py --transcript /tmp/nrf_uart1.jsonl
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
PARTS = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'parts'))
WORKER = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'velxio', 'backend', 'app', 'services', 'nrf52_worker.py'))
FIRMWARE = os.path.normpath(os.path.join(
    HERE, '..', '..', 'parts', 'velxio-pa1616s', 'nrf52840_zephyr', 'compiled.elf'))

MS = 1_000_000
GPS_TX_PIN = 33  # P1.01, uart1 RXD
GPS_RX_PIN = 34  # P1.02, uart1 TXD
FRAME_NS = round(10 * 1e9 / 9600)
STAMP_TOL_NS = 500_000  # the firmware's parse and print; under one frame
INJECTED = 'GPRMC,000000.000,A,5130.0000,N,00007.5000,W,0.00,0.00,010126,,,A'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--firmware', default=FIRMWARE)
    ap.add_argument('--transcript', default='/tmp/nrf52_uart_probe_transcript.jsonl')
    ap.add_argument('--worker', default=WORKER)
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()
    cfg = {'firmware_b64': fw_b64, 'machine': 'nrf52840-dk', 'grading': True,
           'watched_pins': list(range(48)),
           'sensors': [{'sensor_type': 'pa1616s', 'pin': GPS_TX_PIN, 'rx_pin': GPS_RX_PIN, 'fix': False}]}

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

    def serial_lines(uart: int) -> list:
        """(stamp of the closing newline, text) per line the firmware sent on the UART."""
        lines, cur = [], bytearray()
        for e in transcript:
            if e['type'] != 'uart_tx_t' or e['uart'] != uart:
                continue
            if e['byte'] == 0x0A:
                lines.append((e['t_ns'], cur.decode(errors='replace').rstrip('\r')))
                cur = bytearray()
            else:
                cur.append(e['byte'])
        return lines

    def fix_lines() -> list:
        return [(t, text) for t, text in serial_lines(0) if text.startswith('FIX')]

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

    run_to(500)
    commands = serial_lines(1)
    check('both PMTK commands left uart1', [text for _, text in commands] == [
        '$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*28', '$PMTK220,1000*1F'], repr(commands))
    check('the commands left within 5 ms of reset', all(t < 5 * MS for t, _ in commands))
    check('no PMTK text on uart0', not any('PMTK' in text for _, text in serial_lines(0)))
    check('nothing parsed before the first burst', not fix_lines(), repr(fix_lines()))

    run_to(1500)
    first = fix_lines()
    check('first burst is RMC + GGA only: two FIX 0 lines', [text for _, text in first] == ['FIX 0', 'FIX 0'], repr(first))
    state = PA1616SModel().state
    gga = nmea_wrap(build_sentence('GGA', state, 1000))
    rmc = nmea_wrap(build_sentence('RMC', state, 1000))
    expected = [1000 * MS + len(gga) * FRAME_NS, 1000 * MS + (len(gga) + len(rmc)) * FRAME_NS]
    for (t, _), want in zip(first, expected):
        check(f'line lands with its sentence\'s last byte at {want / MS:.3f} ms', 0 <= t - want <= STAMP_TOL_NS, f'{t / MS:.3f} ms')

    run_to(1600)
    send({'cmd': 'sensor_update', 'pin': GPS_TX_PIN, 'fix': True, 'latitude': 40.7128, 'longitude': -74.006})
    send({'cmd': 'sync', 'id': 1})
    check('sync acks the queued sensor_update', wait_for('sync_done')['id'] == 1)
    run_to(1990)
    check('no line between bursts', len(fix_lines()) == 2)
    run_to(2500)
    second = fix_lines()[2:]
    check('second burst carries the driven position', [text for _, text in second] == ['FIX 1 LAT 40.7128 LON -74.0060'] * 2, repr(second))

    run_to(2600)
    send({'cmd': 'uart_send', 'uart': 1, 'data': base64.b64encode(nmea_wrap(INJECTED).encode('ascii')).decode()})
    run_to(2990)
    injected = fix_lines()[4:]
    check('uart_send bytes parse as one sentence', [text for _, text in injected] == ['FIX 1 LAT 51.5000 LON -0.1250'], repr(injected))
    want = 2600 * MS + len(nmea_wrap(INJECTED)) * FRAME_NS
    check(f'uart_send is paced: the line lands at {want / MS:.3f} ms',
          bool(injected) and 0 <= injected[0][0] - want <= STAMP_TOL_NS, repr(injected))

    run_to(3500)
    check('third burst arrived', len(fix_lines()) == 7, f'{len(fix_lines())} lines')
    send({'cmd': 'sensor_detach', 'pin': GPS_TX_PIN})
    send({'cmd': 'sync', 'id': 2})
    check('sync acks the queued sensor_detach', wait_for('sync_done')['id'] == 2)
    run_to(5500)
    check('no burst after detach', len(fix_lines()) == 7, f'{len(fix_lines())} lines')

    send({'cmd': 'stop'})
    proc.wait(timeout=10)
    check('worker exited 0 on stop', proc.returncode == 0, f'rc={proc.returncode}')
    print(f'[wall] probe total {time.perf_counter() - wall0:.2f}s')

    for uart in (0, 1):
        for t, text in serial_lines(uart):
            print(f'[uart{uart}] [{t / MS:9.3f} ms] {text}')

    with open(args.transcript, 'w') as f:
        for ev in transcript:
            f.write(json.dumps(ev, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} events -> {args.transcript}')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.path.insert(0, PARTS)
    from embedgym_parts.pa1616s import PA1616SModel, build_sentence, nmea_wrap
    sys.exit(main())
