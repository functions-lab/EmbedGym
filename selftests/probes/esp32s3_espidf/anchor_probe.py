"""App-start anchor-gap probe for the ESP32 grading worker.

Measures where a naive sketch's t0 anchor (esp_timer_get_time() as the first
statement of app_main) lands relative to the app_started anchor the worker
reports. Pairs with anchor_probe_fw/, whose app_main prints six clock reads
(t0..t5) around a 9-byte marker analog and a single bracketed byte 'B' —
see that main.c for the exact sequence.

Reported quantities (all derived from this run's own bytes, no constants):
  R          per-esp_timer-read cost, guest µs (t1-t0, t2-t1)
  delta9     first→last byte emission cost of the 9-byte marker analog —
             what moving the anchor from the first to the last marker byte
             recovers
  C          guest-clock↔virtual-clock offset, bracketed: the 'B' FIFO write
             happens between the reads returning t4 and t5, so
             C ∈ [v_B - t5*1000, v_B - t4*1000]
  gap        (t0*1000 + C_mid) - app_ns — how late the naive anchor is on
             the harness axis as anchored today
  residual_A gap - delta9 — what would remain with the last-byte anchor

Usage:
  python3 selftests/probes/esp32s3_espidf/anchor_probe.py \
      --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/anchor_probe_fw/compiled.bin
Exit 0 = measurements computed (sanity checks pass); the numbers are the
deliverable.

Reference measurement (2026-08, bit-identical across runs):
  gap = 0.459 ms, delta9 = 6 µs, R = 0-1 µs, C ≈ 1 µs (bracket width 1 µs).
So a naive t0 capture is only ~0.46 ms late — nearly all of it between the
shim's last marker byte and app_main's first statement (invisible to any
marker scheme), none of it marker emission or clock skew. The ~5 ms gap a
since-resolved plans/ note once claimed was a misdiagnosis twice over: the
"all checks invert" repro mixed in the parity flip of the then absolute-clock
sampling-grain gold, and the real multi-ms effect was busy-poll clock drift
(see drift_probe.py), which a yielding loop avoids entirely.
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
ANALOG = b'\x01VLX-APX\x02'


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
        print(f'[{"PASS" if ok else "FAIL"}] {name}'
              + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    send(cfg)
    wait_for('system', timeout=60.0)  # {'event': 'booted'}

    send({'cmd': 'run_to_app_start'})
    started = wait_for('app_started', timeout=120.0)
    app_ns = started['t_ns']
    parked_ns = started['parked_ns']

    # Everything app_main prints lands within a few ms of app start.
    send({'cmd': 'run_to', 't_ns': app_ns + 100 * MS})
    wait_for('run_stopped', timeout=120.0)

    stamped = [(e['byte'], e['t_ns']) for e in transcript
               if e.get('type') == 'uart_tx_t' and e.get('uart') == 0]
    text = bytes(b for b, _ in stamped)

    idx = text.find(ANALOG)
    check('marker analog present in UART stream', idx >= 0)
    if idx < 0:
        send({'cmd': 'stop'})
        proc.wait(timeout=10)
        return 1
    analog_first_ns = stamped[idx][1]
    analog_last_ns = stamped[idx + len(ANALOG) - 1][1]
    delta9 = analog_last_ns - analog_first_ns

    b_idx = idx + len(ANALOG)
    check("bracketed byte 'B' follows the analog",
          text[b_idx:b_idx + 1] == b'B')
    v_b = stamped[b_idx][1]

    line = next((ln for ln in text.decode('utf-8', errors='replace')
                 .splitlines() if ln.startswith('GYMPROBE ')), None)
    check('GYMPROBE line present', line is not None)
    if line is None:
        send({'cmd': 'stop'})
        proc.wait(timeout=10)
        return 1
    t0, t1, t2, t3, t4, t5 = (int(x) for x in line.split()[1:7])

    c_lo = v_b - t5 * 1000
    c_hi = v_b - t4 * 1000
    c_mid = (c_lo + c_hi) // 2
    tau0 = t0 * 1000 + c_mid
    gap = tau0 - app_ns
    residual_a = gap - delta9

    check('C bracket sane (lo <= hi)', c_lo <= c_hi,
          f'[{c_lo}, {c_hi}] ns')
    check('naive anchor not before app start', gap >= 0,
          f'gap={gap} ns')

    print()
    print(f'app_ns            = {app_ns} ns  ({app_ns / 1e6:.3f} ms)')
    print(f'parked_ns - app_ns = {parked_ns - app_ns} ns '
          f'({(parked_ns - app_ns) / 1e6:.3f} ms)')
    print(f'R (t1-t0, t2-t1)  = {t1 - t0} µs, {t2 - t1} µs')
    print(f'delta9            = {delta9} ns  ({delta9 / 1e6:.3f} ms)')
    print(f'C bracket         = [{c_lo}, {c_hi}] ns, '
          f'width {c_hi - c_lo} ns, mid {c_mid} ns ({c_mid / 1e6:.3f} ms)')
    print(f'gap               = {gap} ns  ({gap / 1e6:.3f} ms)')
    print(f'residual_A        = {residual_a} ns  ({residual_a / 1e6:.3f} ms)')

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    print('PROBE ' + ('PASS' if not failures else
                      f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
