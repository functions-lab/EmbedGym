"""LEDC-routing probe for the ESP32-S3 grading worker.

Guards the GPIO number the worker files an LEDC routing under. The S3 lays its
GPIO matrix out at 0x154 / 0x554 (the classic ESP32: 0x130 / 0x530). Before the
library modeled that, the S3 fell through to the
classic decode and every FUNCn_OUT_SEL write landed 9 words late, so the worker
subtracted 9 from the register index. Against the shipped library the index IS
the GPIO number: the worker now reads it as such and a 9-word compensation
files GPIO10 as GPIO1 — a routing no part sits on — and the duty never reaches
the part. The frontend cannot tell that apart from silence, which is why this
probe asserts the worker's own events.

The firmware (ledc_routing_probe_fw/) attaches LEDC channel 0 to GPIO10
(1 kHz, 50 %) and channel 1 to GPIO40 (2 kHz, 25 %), one per GPIO bank. The
probe parks after app start and checks that each GPIO carries exactly its
channel's signal in the worker's `gpio_routing` events (classic namespace:
LS channel N → signal 79 + N, emitted channel 8 + N), that no other GPIO
carries an LEDC signal, and that each channel's `ledc_duty` reports the duty
and frequency the firmware set. A worker still subtracting 9, or a library with
the classic map, fails the GPIO checks.

Usage:
  python3 selftests/probes/esp32s3_espidf/ledc_routing_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/ledc_routing_probe_fw/compiled.bin
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

SIG_LEDC_LS_CH0 = 79        # classic-namespace signal id of LS channel 0
SIG_LEDC_LS_LAST = 86
CHANNEL_EMIT_OFFSET = 8     # S3 channel N is emitted as classic LS channel 8 + N
# gpio → (ledc channel, freq_hz, duty_pct), as the firmware configures them
EXPECTED = {10: (0, 1000, 50.0), 40: (1, 2000, 25.0)}
SETTLE_MS = 300


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
                ev = events.get(timeout=min(remaining, 1.0))
            except queue.Empty:
                if proc.poll() is not None:
                    raise RuntimeError(f'worker exited with code {proc.returncode} '
                                       f'while waiting for {type_}')
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

    # run_to takes absolute virtual time (from power-on).
    send({'cmd': 'run_to', 't_ns': app_ns + SETTLE_MS * MS})
    wait_for('run_stopped', timeout=300.0)
    # run_stopped is a barrier on the worker's stdout, but the reader thread
    # still has a backlog to parse. Wait for the count to stop growing.
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

    # Final routing per GPIO: replay the worker's routing events in order.
    routing: dict = {}  # gpio → signal_id
    for e in transcript:
        if e.get('type') == 'gpio_routing':
            routing[e['gpio']] = e['signal_id']
        elif e.get('type') == 'gpio_routing_clear':
            routing.pop(e['gpio'], None)
    ledc_routed = {g: s for g, s in routing.items() if SIG_LEDC_LS_CH0 <= s <= SIG_LEDC_LS_LAST}

    for gpio, (channel, _freq, _duty) in EXPECTED.items():
        want = SIG_LEDC_LS_CH0 + channel
        got = routing.get(gpio)
        check(f'GPIO{gpio} routed to LEDC channel {channel} (signal {want})', got == want,
              f'signal {got}' if got is not None else
              f'no routing; LEDC routings seen: {sorted(ledc_routed.items())}')

    unexpected = sorted(set(ledc_routed) - set(EXPECTED))
    check('no other GPIO carries an LEDC signal', not unexpected,
          f'gpios {[(g, ledc_routed[g]) for g in unexpected]}')

    # Latest duty per emitted channel.
    duty: dict = {}
    for e in transcript:
        if e.get('type') == 'ledc_duty':
            duty[e['channel']] = e
    for gpio, (channel, freq_hz, duty_pct) in EXPECTED.items():
        ev = duty.get(channel + CHANNEL_EMIT_OFFSET)
        detail = (f"duty {ev['duty_pct']} %, {ev['freq_hz']} Hz" if ev
                  else f'no ledc_duty for emitted channel {channel + CHANNEL_EMIT_OFFSET}; '
                       f'channels seen: {sorted(duty)}')
        check(f'GPIO{gpio}: channel {channel} reports {duty_pct} % at {freq_hz} Hz',
              ev is not None and abs(ev['duty_pct'] - duty_pct) < 0.5 and ev['freq_hz'] == freq_hz,
              detail)

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
