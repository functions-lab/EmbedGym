"""SAADC probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser), sets a level on
every AIN before the app starts, and drives the adc_probe/ firmware (Zephyr's
own SAADC driver; see adc_probe/app/src/main.c for the phases):

  1. Booted parked; no guest events before run_to.
  2. Every MAP line round-trips its level through Zephyr's driver: START →
     STARTED + IRQ → SAMPLE from inside the ISR → EasyDMA → END + IRQ, with
     an offset calibration ahead of the first read. Channel n is wired to
     AIN(7-n), so the raw values prove CH[n].PSELP resolves to an AIN.
  3. SCALE lines at each gain, reference and resolution carry the raw the
     registers imply; DIFF lines are signed V(P) - V(N) both ways; OVER is
     the 8x burst read.
  4. The register-driven lines: a LIMIT comparator latches LIMITH and LIMITL;
     4x oversampling without burst ends on the fourth SAMPLE; SAMPLERATE
     timer mode fills the buffer at CC / 16 MHz per sample and a START alone
     does not restart it; STOP mid-buffer leaves AMOUNT at the samples taken
     with END and STOPPED both set.
  5. set_adc while parked is acked by sync; every LIVE line after the drive
     shows the new level, none before it does.
  6. The stamped transcript is written to --transcript; two runs must be
     byte-identical.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT (the worker reads both). Run with
py312_native's `python` (Homebrew python3 lacks pyrenode3).
Build the firmware first:
  python3 backend_compile.py selftests/probes/nrf52840_zephyr/adc_probe --src-dir app \
      --out compiled.elf --fqbn zephyr:nrf52840dk/nrf52840
Usage:
  python selftests/probes/nrf52840_zephyr/adc_probe.py --transcript /tmp/nrf_adc1.jsonl
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
FIRMWARE = os.path.join(HERE, 'adc_probe', 'compiled.elf')

MS = 1_000_000
LEVELS = {ain: 300 * (ain + 1) for ain in range(8)}  # AIN0 300 mV … AIN7 2400 mV
DRIVEN_AIN, DRIVEN_MV = 7, 1000  # channel 0, the LIVE channel
RAW_AIN = 4  # channel 3, the register-driven phase
GAINS = {'1_6': (1, 6), '1_5': (1, 5), '1_4': (1, 4), '1_3': (1, 3), '1_2': (1, 2), '1': (1, 1), '2': (2, 1), '4': (4, 1)}
REF_MV = {'int': 600, 'vdd4': 825}
CONT_CC, CONT_SAMPLES, SAADC_CLOCK_HZ = 2047, 40, 16_000_000
CONT_TOL_US = 100  # k_cycle_get_32 ticks at 32768 Hz, 30.5 µs per tick

MAP_RE = re.compile(r'^MAP ch=(\d) ain=(\d) raw=(-?\d+) mv=(-?\d+)$')
SCALE_RE = re.compile(r'^SCALE gain=(\S+) ref=(\S+) res=(\d+) raw=(-?\d+)$')
DIFF_RE = re.compile(r'^DIFF p=(\d) n=(\d) raw=(-?\d+)$')
OVER_RE = re.compile(r'^OVER x=8 raw=(-?\d+)$')
LIMIT_RE = re.compile(r'^RAW limit=(\S+) hit_high=(\d) hit_low=(\d) raw=(-?\d+)$')
RAWOVER_RE = re.compile(r'^RAWOVER samples=(\d+) amount=(\d+) raw=(-?\d+)$')
CONT_RE = re.compile(r'^CONT amount=(\d+) us=(\d+) idle_end=(\d) first=(-?\d+) last=(-?\d+)$')
STOP_RE = re.compile(r'^STOP amount=(\d+) end_before=(\d) end=(\d) stopped=(\d)$')
LIVE_RE = re.compile(r'^LIVE raw=(-?\d+) mv=(-?\d+)$')


def raw_for(mv: float, gain: tuple, ref_mv: int, bits: int, differential: bool = False) -> int:
    numerator, denominator = gain
    full_scale = 1 << (bits - 1 if differential else bits)
    return round(mv * numerator * full_scale / (denominator * ref_mv))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--firmware', default=FIRMWARE)
    ap.add_argument('--transcript', default='/tmp/nrf52_adc_probe_transcript.jsonl')
    ap.add_argument('--worker', default=WORKER)
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
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

    def matches(pattern: 're.Pattern') -> list:
        out = []
        for t, text in serial_lines():
            m = pattern.match(text)
            if m:
                out.append((t, m.groups()))
        return out

    def one_line(name: str, pattern: 're.Pattern') -> tuple:
        found = matches(pattern)
        check(f'exactly one {name} line', len(found) == 1, f'{len(found)} lines')
        return found[0][1] if len(found) == 1 else None

    wall0 = time.perf_counter()
    send(cfg)
    booted = wait_for('system', timeout=120.0)
    check('booted', booted['event'] == 'booted')
    print(f'[wall] booted after {time.perf_counter() - wall0:.2f}s')

    time.sleep(0.5)
    guest_pre = [e for e in transcript if e['type'] in ('uart_tx_t', 'gpio_change')]
    check('no guest events before first run_to', not guest_pre, f'{len(guest_pre)} events')

    for ain, mv in LEVELS.items():
        send({'cmd': 'set_adc', 'channel': ain, 'millivolts': mv})
    send({'cmd': 'sync', 'id': 1})
    check('sync acks the eight set_adc', wait_for('sync_done')['id'] == 1)

    send({'cmd': 'run_to_app_start'})
    check('app_started at t_ns 0', wait_for('app_started')['t_ns'] == 0)

    run_to(400)
    check('no ERR line', not any(text.startswith('ERR') for _, text in serial_lines()),
          '; '.join(text for _, text in serial_lines() if text.startswith('ERR')))

    maps = [g for _, g in matches(MAP_RE)]
    check('eight MAP lines, channels 0..7 in order', [int(g[0]) for g in maps] == list(range(8)), repr(maps))
    for ch, ain, raw, mv in ((int(a), int(b), int(c), int(d)) for a, b, c, d in maps):
        level = LEVELS[7 - ch]
        check(f'MAP ch{ch} reads AIN{7 - ch}: raw {raw_for(level, GAINS["1_6"], 600, 12)}, {level} mV',
              ain == 7 - ch and raw == raw_for(level, GAINS['1_6'], 600, 12) and abs(mv - level) <= 1,
              f'ain={ain} raw={raw} mv={mv}')

    scales = [g for _, g in matches(SCALE_RE)]
    check('sixteen SCALE lines', len(scales) == 16, f'{len(scales)} lines')
    for gain, ref, res, raw in ((a, b, int(c), int(d)) for a, b, c, d in scales):
        want = raw_for(LEVELS[0], GAINS[gain], REF_MV[ref], res)
        check(f'SCALE gain {gain} ref {ref} {res}-bit: raw {want}', raw == want, f'raw={raw}')

    diffs = {(int(p), int(n)): int(raw) for _, (p, n, raw) in matches(DIFF_RE)}
    check('DIFF AIN6 - AIN7 is signed', diffs.get((6, 7)) == raw_for(LEVELS[6] - LEVELS[7], GAINS['1_6'], 600, 12, True), repr(diffs))
    check('DIFF AIN7 - AIN6 is positive', diffs.get((7, 6)) == raw_for(LEVELS[7] - LEVELS[6], GAINS['1_6'], 600, 12, True), repr(diffs))

    over = one_line('OVER', OVER_RE)
    if over:
        check('OVER 8x burst read equals the single sample', int(over[0]) == raw_for(LEVELS[5], GAINS['1_6'], 600, 12), f'raw={over[0]}')

    raw_expected = raw_for(LEVELS[RAW_AIN], GAINS['1_6'], 600, 12)
    limits = {label: (int(h), int(l), int(raw)) for _, (label, h, l, raw) in matches(LIMIT_RE)}
    check('LIMIT high 1000 latches LIMITH only', limits.get('high') == (1, 0, raw_expected), repr(limits))
    check('LIMIT low 2000 latches LIMITL only', limits.get('low') == (0, 1, raw_expected), repr(limits))

    rawover = one_line('RAWOVER', RAWOVER_RE)
    if rawover:
        check('4x oversampling without burst ends on the fourth SAMPLE',
              tuple(int(v) for v in rawover) == (4, 1, raw_expected), repr(rawover))

    cont = one_line('CONT', CONT_RE)
    if cont:
        amount, us, idle_end, first, last = (int(v) for v in cont)
        want_us = CONT_SAMPLES * CONT_CC * 1e6 / SAADC_CLOCK_HZ
        check(f'SAMPLERATE timer fills {CONT_SAMPLES} samples', amount == CONT_SAMPLES and first == raw_expected and last == raw_expected, repr(cont))
        check(f'timer paces at CC / 16 MHz: {want_us:.0f} µs ± {CONT_TOL_US}', abs(us - want_us) <= CONT_TOL_US, f'{us} µs')
        check('START alone does not restart the timer', idle_end == 0)

    stop = one_line('STOP', STOP_RE)
    if stop:
        check('STOP mid-buffer: AMOUNT 2, END and STOPPED set', tuple(int(v) for v in stop) == (2, 0, 1, 1), repr(stop))

    live_before = [(t, int(raw), int(mv)) for t, (raw, mv) in matches(LIVE_RE)]
    check('LIVE lines by 400 ms', len(live_before) >= 1, f'{len(live_before)} lines')
    check(f'every LIVE line reads AIN7 at {LEVELS[7]} mV',
          all(raw == raw_for(LEVELS[7], GAINS['1_6'], 600, 12) and abs(mv - LEVELS[7]) <= 1 for _, raw, mv in live_before),
          repr(live_before[:3]))

    run_to(500)
    send({'cmd': 'set_adc', 'channel': DRIVEN_AIN, 'millivolts': DRIVEN_MV})
    send({'cmd': 'sync', 'id': 2})
    check('sync acks the queued set_adc', wait_for('sync_done')['id'] == 2)
    run_to(1000)

    lives = [(t, int(raw), int(mv)) for t, (raw, mv) in matches(LIVE_RE)]
    old, new = [l for l in lives if l[0] <= 500 * MS], [l for l in lives if l[0] > 520 * MS]
    check('LIVE lines on both sides of the drive', len(old) >= 1 and len(new) >= 1, f'{len(old)} before, {len(new)} after')
    check(f'every LIVE line before 500 ms reads {LEVELS[7]} mV', all(abs(mv - LEVELS[7]) <= 1 for _, _, mv in old),
          ', '.join(f'{t / MS:.1f}ms {mv}' for t, _, mv in old))
    check(f'every LIVE line after the drive reads {DRIVEN_MV} mV',
          all(raw == raw_for(DRIVEN_MV, GAINS['1_6'], 600, 12) and abs(mv - DRIVEN_MV) <= 1 for _, raw, mv in new),
          ', '.join(f'{t / MS:.1f}ms {mv}' for t, _, mv in new))
    check('LIVE count matches the 100 ms cadence by 1000 ms', 6 <= len(lives) <= 11, f'{len(lives)} lines')

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
