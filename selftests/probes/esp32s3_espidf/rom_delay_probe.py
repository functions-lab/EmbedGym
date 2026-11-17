"""ROM-delay probe for the ESP32-S3 grading worker.

Guards the CPU clock the guest programs. esp_rom_delay_us() busy-waits on
CCOUNT, which ticks at the Xtensa core's Clock object; IDF switches the S3 to
160 MHz at boot by writing SYSTEM_CPU_PER_CONF / SYSTEM_SYSCLK_CONF. The QEMU
S3 used to drop those writes and leave the core at its 40 MHz reset rate, so
every esp_rom_delay_us(n) lasted 4n us while esp_timer_get_time() (systimer,
fixed 16 MHz) stayed exact. Bit-banged drivers that pace their edges with the
ROM delay (DHT11 handshake, 1-Wire slots) then sampled far too late.

The firmware (rom_delay_probe_fw/) brackets esp_rom_delay_us(1000) between two
esp_timer_get_time() reads and prints the difference as `GYMDELAY <us>`, so
each line is the ROM delay measured against the exact clock. A library built
before the fix prints ~4001; a fixed one prints ~1001.

Usage:
  python3 selftests/probes/esp32s3_espidf/rom_delay_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/rom_delay_probe_fw/compiled.bin
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

REQUESTED_US = 1000
RUN_TO_MS = 1000
# The firmware prints every ~51 ms (1 ms delay + 50 ms vTaskDelay), so a 1 s
# window yields ~19 lines; require enough that an early crash cannot pass.
MIN_LINES = 10
# The bug reads 4001; the fix reads 1001 (one esp_timer read of overhead).
# 20 us leaves room for the read cost without admitting any wrong clock rate.
MAX_US = REQUESTED_US + 20


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
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    send(cfg)
    wait_for('system', timeout=60.0)  # {'event': 'booted'}

    send({'cmd': 'run_to_app_start'})
    app_ns = wait_for('app_started', timeout=120.0)['t_ns']

    # run_to takes absolute virtual time (from power-on); the ROM+bootloader
    # phase before app start has to be added or the run ends that much short.
    send({'cmd': 'run_to', 't_ns': app_ns + RUN_TO_MS * MS})
    wait_for('run_stopped', timeout=300.0)
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

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    text = bytes(e['byte'] for e in transcript
                 if e.get('type') == 'uart_tx_t' and e.get('uart') == 0)
    lines = text.decode('utf-8', errors='replace').splitlines()
    delays = [int(m.group(1)) for m in
              (re.fullmatch(r'GYMDELAY (\d+)', ln.strip()) for ln in lines) if m]

    check('enough GYMDELAY lines to judge', len(delays) >= MIN_LINES,
          f'{len(delays)} lines over {RUN_TO_MS} ms of app time')
    if not delays:
        print('PROBE FAIL (no GYMDELAY lines; last serial lines: '
              f'{lines[-3:] if lines else "(none)"})')
        return 1

    lo, hi = min(delays), max(delays)
    check(f'esp_rom_delay_us({REQUESTED_US}) never shorter than requested',
          lo >= REQUESTED_US, f'min {lo} us')
    check(f'esp_rom_delay_us({REQUESTED_US}) lasts at most {MAX_US} us',
          hi <= MAX_US, f'max {hi} us')

    print(f'delays: {len(delays)} samples, min {lo} us, max {hi} us, '
          f'first {delays[:4]}')

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
