"""GPIO-collision probe for the ESP32 grading worker.

Two sensor models on one GPIO fight over the pin level, and the loser
misbehaves silently: a relay sharing a keypad column made a quarter of the
keys mis-scan while every relay assertion still passed. The worker refuses
such a config instead. This probe proves the refusal reaches the client:

  1. A config wiring a keypad across GPIO9-14/43/44 plus a dht11 on GPIO12
     produces an 'error' event naming the pin and both owners.
  2. No 'booted' handshake follows — the worker never starts the guest.
  3. The process exits non-zero.

Check 1 is the part a unit test cannot see: _fatal has to drain the emit
writer (a daemon thread) before exiting, or the frame dies with the process.

Usage:
  python3 selftests/probes/esp32s3_espidf/gpio_collision_probe.py \
      --lib <libqemu-xtensa.(so|dylib)> --firmware <merged.bin>
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

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', '..', '..', 'velxio', 'backend', 'app',
                      'services', 'esp32_worker.py')


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
        'sensors': [
            {'sensor_type': 'membrane-keypad', 'pin': 9,
             'r2_pin': 10, 'r3_pin': 11, 'r4_pin': 13,
             'c1_pin': 14, 'c2_pin': 12, 'c3_pin': 43, 'c4_pin': 44,
             'keys': []},
            {'sensor_type': 'dht11', 'pin': 12, 'temperature': 25, 'humidity': 50},
        ],
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
            if idx < 0:
                continue
            try:
                events.put(json.loads(line[idx:].strip()))
            except Exception:
                continue

    threading.Thread(target=reader, daemon=True).start()

    proc.stdin.write(json.dumps(cfg) + '\n')
    proc.stdin.flush()

    error_msg = None
    booted = False
    while True:
        try:
            ev = events.get(timeout=30)
        except queue.Empty:
            break
        if ev.get('type') == 'error' and error_msg is None:
            error_msg = ev.get('message', '')
            break
        if ev.get('type') == 'system' and ev.get('event') == 'booted':
            booted = True
            break

    try:
        rc = proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        proc.kill()
        rc = None

    failures = []
    if booted:
        failures.append('worker booted the guest despite the GPIO collision')
    if error_msg is None:
        failures.append('no error event arrived (the fatal frame was lost)')
    else:
        for token in ('GPIO12', 'dht11@12', 'membrane-keypad@9'):
            if token not in error_msg:
                failures.append(f'error message does not name {token}: {error_msg!r}')
    if rc is None:
        failures.append('worker did not exit')
    elif rc == 0:
        failures.append('worker exited 0, expected non-zero')

    for f in failures:
        print(f'FAIL: {f}')
    if failures:
        return 1
    print(f'PASS — worker refused the collision and exited {rc}')
    print(f'       {error_msg}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
