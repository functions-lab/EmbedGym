"""GPSPI2 probe for the ESP32-S3 grading worker.

Guards the path from IDF's `driver/spi_master.h` to a SPI slave the worker
models. The QEMU S3's GPSPI2 model used to lose it several ways over: no
`trans_done` latch (and its DMA_INT_* registers at the wrong offsets), so
`spi_device_polling_transmit` spun forever on the first transaction; the
device's IRQ was never connected to the interrupt matrix, so the ISR path
hung too; the CS outputs were never connected, so the worker saw no
chip-select; command / address / dummy phases were dropped and half-duplex
ran as full-duplex; and nothing moved through GDMA, so a bus initialized
with `SPI_DMA_CH_AUTO` sent nothing.

The firmware (spi_probe_fw/) talks to a bme280 attached as a SPI slave on
CS GPIO41 and prints `GYMSPI <variant> <hex bytes>` for six transactions
(polling, interrupt, address-phase half-duplex, a 27-byte GDMA burst, a
write pair read back, and a device with CS bit-banged by the firmware). The
probe checks each answer against the slave's register file, that the
hardware CS toggles reached the worker's pin path as `gpio_change` frames
before the bit-banged variant, and that the worker survived. A library
built before the fix prints nothing.

Usage:
  python3 selftests/probes/esp32s3_espidf/spi_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/spi_probe_fw/compiled.bin
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

CS_GPIO = 41
RUN_MS = 3000           # virtual time for all six variants
CHIP_ID = 0x60
VARIANTS = (1, 2, 3, 4, 5, 6)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--machine', default='esp32s3-picsimlab')
    ap.add_argument('--worker', default=os.path.normpath(WORKER))
    ap.add_argument('--dump', action='store_true',
                    help='print every non-serial worker frame and every serial line')
    args = ap.parse_args()

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()

    cfg = {
        'lib_path': os.path.abspath(args.lib),
        'firmware_b64': fw_b64,
        'machine': args.machine,
        'sensors': [{
            'sensor_type': 'bme280',
            'pin': CS_GPIO,
            'transport': 'spi',
            'temperature': 31,
            'pressure': 1013.25,
            'humidity': 64,
        }],
        'wifi_enabled': False,
        'grading': True,
        'watched_pins': list(range(49)),
    }

    proc = subprocess.Popen(
        [sys.executable, args.worker],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=None if args.dump else subprocess.DEVNULL, text=True, bufsize=1,
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

    park(RUN_MS)

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

    check('worker alive after the transactions', proc.poll() is None,
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

    answers: dict = {}   # variant -> (t_ns, [bytes]) or (t_ns, 'ERR …')
    for t, text in lines:
        m = re.fullmatch(r'GYMSPI (\d+) (.*)', text.strip())
        if not m:
            continue
        variant = int(m.group(1))
        payload = m.group(2)
        if payload.startswith('ERR'):
            answers[variant] = (t, payload)
        else:
            answers[variant] = (t, [int(h, 16) for h in payload.split()])

    def got(variant: int) -> list:
        entry = answers.get(variant)
        if entry is None or isinstance(entry[1], str):
            return []
        return entry[1]

    def describe(variant: int) -> str:
        entry = answers.get(variant)
        if entry is None:
            return 'never printed'
        if isinstance(entry[1], str):
            return entry[1]
        return ' '.join(f'{b:02X}' for b in entry[1])

    for variant in VARIANTS:
        check(f'variant {variant} printed a byte line', bool(got(variant)), describe(variant))

    b1, b2, b3, b4, b5, b6 = (got(v) for v in VARIANTS)
    check('1: polling full-duplex reads chip id', len(b1) == 2 and b1[1] == CHIP_ID, describe(1))
    check('2: interrupt-driven transmit reads chip id', len(b2) == 2 and b2[1] == CHIP_ID, describe(2))
    check('3: half-duplex with address phase reads chip id', len(b3) == 1 and b3[0] == CHIP_ID, describe(3))
    check('4: GDMA burst returns 27 bytes', len(b4) == 27, describe(4))
    dig_t1 = (b4[1] | (b4[2] << 8)) if len(b4) >= 3 else 0
    check('4: calibration dig_T1 is non-zero', dig_t1 != 0, f'dig_T1 = {dig_t1}')
    check('5: written ctrl_hum reads back as 0x01', len(b5) == 2 and b5[1] == 0x01, describe(5))
    check('6: bit-banged CS device reads chip id', len(b6) == 2 and b6[1] == CHIP_ID, describe(6))

    # Hardware CS: the peripheral's CS0 toggles must reach the worker's pin
    # path — as gpio_change frames for GPIO41 — before the firmware starts
    # driving that pin itself in variant 6.
    t_variant6 = answers[6][0] if 6 in answers else None
    cs_changes = [e for e in transcript
                  if e.get('type') == 'gpio_change' and e.get('pin') == CS_GPIO
                  and 't_ns' in e]
    hw_cs = [e for e in cs_changes if t_variant6 is None or e['t_ns'] < t_variant6]
    check('hardware CS toggles on GPIO41 reached the pin path', len(hw_cs) >= 2,
          f'{len(hw_cs)} gpio_change frames before variant 6 ({len(cs_changes)} total)')

    if args.dump:
        for e in transcript:
            if e.get('type') not in ('uart_tx_t', 'uart_tx'):
                print('[frame]', json.dumps({k: v for k, v in e.items() if k != 'b64'}))
        for t_ns, text in lines:
            print(f'[serial] [{t_ns / MS:.3f} ms] {text}')
    print(f'serial: {len(lines)} lines, {len(answers)} GYMSPI')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
