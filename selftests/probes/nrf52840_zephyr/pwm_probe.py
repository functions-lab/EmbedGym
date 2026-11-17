"""PWM probe for the nRF52840 Renode grading worker.

Spawns nrf52_worker.py directly (no backend, no browser) and runs the
`wokwi-buzzer-pwm` selftest firmware (pwm_set_dt on &pwm0 channel 0, P1.15 =
global pin 47): 1000 Hz, silence, 375 Hz, 1600 Hz at the same 50 % duty,
silence.

  1. Every tone is one pwm_duty event within 1 ms of its second, carrying the
     duty and the frequency Zephyr's registers give: period_cycles = period_ns
     * 16 MHz / 1e9, halved with PRESCALER incremented until it fits
     COUNTERTOP's 15 bits.
  2. A retune at an unchanged duty still reports; silence is duty 0 at
     frequency 0; nothing else is reported.
  3. The stamped transcript is written to --transcript; two runs must be
     byte-identical.

Env: EMBEDGYM_RENODE_ROOT, DOTNET_ROOT (the worker reads both). Run with
py312_native's `python` (Homebrew python3 lacks pyrenode3).
Build the firmware first:
  bash run.sh --headless selftests/parts/wokwi-buzzer-pwm nrf52840_zephyr
Usage:
  python selftests/probes/nrf52840_zephyr/pwm_probe.py --transcript /tmp/nrf_pwm1.jsonl
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
FIRMWARE = os.path.normpath(os.path.join(
    HERE, '..', '..', 'parts', 'wokwi-buzzer-pwm', 'nrf52840_zephyr', 'compiled.elf'))

MS = 1_000_000
BUZZER_PIN = 47
TONES = ((0, 1000), (1000, None), (2000, 375), (3000, 1600), (4000, None))  # (ms, Hz or silence)
END_MS = 4500
EVENT_TOL_NS = 1 * MS


def zephyr_waveform(hz: int) -> tuple:
    period_ns = 1_000_000_000 // hz
    period_cycles = period_ns * 16_000_000 // 1_000_000_000
    pulse_cycles = (period_ns // 2) * 16_000_000 // 1_000_000_000
    countertop, prescaler = period_cycles, 0
    while countertop > 32767:
        countertop >>= 1
        prescaler += 1
    return (pulse_cycles >> prescaler) / countertop, 16_000_000 / (2 ** prescaler * countertop)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--firmware', default=FIRMWARE)
    ap.add_argument('--transcript', default='/tmp/nrf52_pwm_probe_transcript.jsonl')
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

    send(cfg)
    check('booted', wait_for('system', timeout=120.0)['event'] == 'booted')
    send({'cmd': 'run_to_app_start'})
    check('app_started at t_ns 0', wait_for('app_started')['t_ns'] == 0)
    send({'cmd': 'run_to', 't_ns': END_MS * MS})
    check(f'park at {END_MS} ms exact', wait_for('run_stopped', timeout=300.0)['t_ns'] == END_MS * MS)
    send({'cmd': 'stop'})
    proc.wait(timeout=10)
    check('worker exited 0 on stop', proc.returncode == 0, f'rc={proc.returncode}')

    reports = [e for e in transcript if e['type'] == 'pwm_duty']
    for e in reports:
        print(f'pwm_duty [{e["t_ns"] / MS:9.3f} ms] pin {e["pin"]} duty {e["duty"]} frequency {e["frequency"]}')
    check('one pwm_duty per tone change, all on P1.15',
          len(reports) == len(TONES) and all(e['pin'] == BUZZER_PIN for e in reports), f'{len(reports)} events')
    for (at_ms, hz), e in zip(TONES, reports):
        duty, frequency = zephyr_waveform(hz) if hz else (0.0, 0.0)
        check(f'{hz or "silence"} at {at_ms} ms: duty {duty:.5f}, {frequency:.3f} Hz',
              e['duty'] == duty and e['frequency'] == frequency and 0 <= e['t_ns'] - at_ms * MS <= EVENT_TOL_NS,
              f'duty={e["duty"]} frequency={e["frequency"]} t={e["t_ns"] / MS:.3f} ms')

    with open(args.transcript, 'w') as f:
        for ev in transcript:
            f.write(json.dumps(ev, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} events -> {args.transcript}')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
