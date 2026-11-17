"""GPIO-interrupt probe for the ESP32-S3 grading worker.

Guards the path from a host-driven pin edge to a firmware ISR. The QEMU S3 used
to lose it four times over: the GPIO device decoded the plain ESP32's register
map (PIN regs at 0x88, not the S3's 0x74), so the interrupt type and enable
bits never reached the model; a hit was filed in the APP-CPU status register
while ESP-IDF's S3 HAL reads PCPU_INT for every core; the device's IRQ line was
never connected to the interrupt matrix; and qemu_picsimlab_set_pin did not
hold the BQL, which aborted QEMU the moment an interrupt could reach the CPU.

The firmware (gpio_isr_probe_fw/) installs one any-edge ISR on GPIO4 (bank 0)
and one on GPIO40 (bank 1) and prints `GYMISR <gpio> <count> <level>` per
event from a task fed by the ISRs. The probe drives each pin high then low
from a park and checks the counts, the levels, that each line prints within a
few ms of its edge (an interrupt, not a poll), and that the worker survived.
A library built before the fix prints nothing.

Usage:
  python3 selftests/probes/esp32s3_espidf/gpio_isr_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/gpio_isr_probe_fw/compiled.bin
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

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', '..', '..', 'velxio', 'backend', 'app',
                      'services', 'esp32_worker.py')

MS = 1_000_000  # ns per ms

PINS = (4, 40)          # one per GPIO bank
SETTLE_MS = 100         # run this long after each drive before the next
MAX_LATENCY_MS = 5      # edge to first printed byte of its GYMISR line


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
                                       f'while waiting for {type_} (QEMU aborted?)')
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
    t_ns = wait_for('app_started', timeout=120.0)['t_ns']

    def park(delta_ms: int) -> int:
        nonlocal t_ns
        # run_to takes absolute virtual time (from power-on).
        t_ns += delta_ms * MS
        send({'cmd': 'run_to', 't_ns': t_ns})
        wait_for('run_stopped', timeout=300.0)
        return t_ns

    park(SETTLE_MS)  # let app_main install the ISRs before the first edge
    drives: list = []  # (t_ns, gpio, level)
    for gpio in PINS:
        for level in (1, 0):
            send({'cmd': 'set_pin', 'pin': gpio, 'value': level})
            drives.append((t_ns, gpio, level))
            park(SETTLE_MS)

    # run_stopped is a barrier on the worker's stdout, but the reader thread
    # still has the backlog of uart_tx_t lines to parse. Wait for the count to
    # stop growing, or the tail of the serial output goes missing.
    stable = 0
    seen = -1
    while stable < 3:
        time.sleep(0.2)
        now = len(transcript)
        stable = stable + 1 if now == seen else 0
        seen = now

    check('worker alive after the last edge (no BQL abort)', proc.poll() is None,
          f'exit code {proc.returncode}' if proc.poll() is not None else '')

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    # Rebuild serial lines with the virtual time of their first byte.
    lines: list = []  # (t_ns, text)
    buf = bytearray()
    buf_t = None
    for e in transcript:
        if e.get('type') != 'uart_tx_t' or e.get('uart') != 0:
            continue
        if buf_t is None:
            buf_t = e['t_ns']
        b = e['byte']
        if b == 0x0A:
            lines.append((buf_t, buf.decode('utf-8', errors='replace').rstrip('\r')))
            buf = bytearray()
            buf_t = None
        else:
            buf.append(b)

    isr: list = []  # (t_ns, gpio, count, level)
    for t, text in lines:
        m = re.fullmatch(r'GYMISR (\d+) (\d+) (\d+)', text.strip())
        if m:
            isr.append((t, int(m.group(1)), int(m.group(2)), int(m.group(3))))

    first_drive_ns = drives[0][0]
    early = [x for x in isr if x[0] <= first_drive_ns]
    check('no ISR line before the first edge', not early, f'{len(early)} early lines')

    for gpio in PINS:
        mine = [x for x in isr if x[1] == gpio]
        check(f'GPIO{gpio}: exactly 2 ISR lines (rise, fall)', len(mine) == 2,
              f'{len(mine)} lines: {[(c, l) for _, _, c, l in mine]}')
        check(f'GPIO{gpio}: counts 1, 2 with levels 1, 0',
              [(c, l) for _, _, c, l in mine] == [(1, 1), (2, 0)])

    unexpected = sorted({x[1] for x in isr} - set(PINS))
    check('no ISR line from an unwatched pin', not unexpected, f'gpios {unexpected}')

    for drive_ns, gpio, level in drives:
        hits = [x for x in isr if x[1] == gpio and x[3] == level
                and 0 <= x[0] - drive_ns <= MAX_LATENCY_MS * MS]
        got = [x for x in isr if x[1] == gpio and x[3] == level]
        detail = (f'printed {(got[0][0] - drive_ns) / MS:.2f} ms after the edge'
                  if got else 'never printed')
        check(f'GPIO{gpio} -> {level}: ISR line within {MAX_LATENCY_MS} ms of the edge',
              len(hits) == 1, detail)

    print(f'serial: {len(lines)} lines, {len(isr)} GYMISR')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
