"""UART1 / UART2 receive probe for the ESP32-S3 grading worker.

Guards the path a UART part (pa1616s) depends on: bytes the host injects into
UART1 or UART2 with `uart_send` reach the legacy driver's `uart_read_bytes`,
the firmware's reply on that UART comes back as `uart_tx_t` frames tagged with
the UART id, and the delivery is timed on the virtual clock. The firmware
(uart_probe_fw/) serves UART1 for the first 3 s of app time, then UART2 on
the same pins; each chunk it receives is printed as
`GYMRX <port> <t_us> <n> <text>` and echoed.

The probe also measures the receive timing a UART part relies on:
  - `uart_send` paces the bytes one frame apart at the firmware's baud rate,
    so a burst longer than the 128-byte RX FIFO arrives whole;
  - a burst shorter than the driver's 120-byte full threshold reaches the
    firmware through the RX-timeout interrupt, timed from the real baud
    rate — the latency printed here is what a GPS sentence costs between
    its last byte and the firmware seeing it.

Usage:
  python3 selftests/probes/esp32s3_espidf/uart_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/uart_probe_fw/compiled.bin
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

SHORT_BURST = b'$GYMPROBE,0123456789,ABCDEF*00\r\n'   # 32 bytes, under the 120-byte threshold
LONG_BURST = bytes((0x30 + (i % 10)) for i in range(200))  # over the 128-byte FIFO
FRAME_NS = 10 * 1_000_000_000 / 9600   # 8N1 at 9600, as uart_probe_fw configures
# Last byte's arrival -> GYMRX print: the 100-bit RX timeout (10.4 ms at 9600)
# plus uart_read_bytes waiting out its 10 ms for more bytes.
MAX_LATENCY_MS = 25


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
    app_ns = wait_for('app_started', timeout=120.0)['t_ns']
    t_ns = app_ns

    def park(delta_ms: int) -> int:
        nonlocal t_ns
        t_ns += delta_ms * MS
        send({'cmd': 'run_to', 't_ns': t_ns})
        wait_for('run_stopped', timeout=300.0)
        return t_ns

    def inject(uart: int, data: bytes) -> int:
        send({'cmd': 'uart_send', 'uart': uart,
              'data': base64.b64encode(data).decode()})
        send({'cmd': 'sync', 'id': 1})
        wait_for('sync_done')
        return t_ns

    injections: list = []  # (name, uart, t_ns, data)

    park(200)  # driver installed on UART1
    injections.append(('uart1 short', 1, inject(1, SHORT_BURST), SHORT_BURST))
    park(1000)
    injections.append(('uart1 long', 1, inject(1, LONG_BURST), LONG_BURST))
    park(1000)
    park(1100)  # 3300 ms: firmware has moved to UART2
    injections.append(('uart2 short', 2, inject(2, SHORT_BURST), SHORT_BURST))
    park(1000)
    injections.append(('uart1 after close', 1, inject(1, SHORT_BURST), SHORT_BURST))
    park(1000)

    stable = 0
    seen = -1
    while stable < 3:
        time.sleep(0.2)
        now = len(transcript)
        stable = stable + 1 if now == seen else 0
        seen = now

    check('worker alive after the last injection', proc.poll() is None,
          f'exit code {proc.returncode}' if proc.poll() is not None else '')

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    # Console lines with the virtual time of their first byte; echo bytes per UART.
    lines: list = []  # (t_ns, text)
    echo: dict = {1: [], 2: []}  # uart -> [(t_ns, byte)]
    buf = bytearray()
    buf_t = None
    for e in transcript:
        if e.get('type') != 'uart_tx_t':
            continue
        if e.get('uart') in echo:
            echo[e['uart']].append((e['t_ns'], e['byte']))
            continue
        if e.get('uart') != 0:
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

    opens = [(t, text) for t, text in lines if text.startswith('GYMUART open')]
    for port in (1, 2):
        mine = [text for _, text in opens if text.startswith(f'GYMUART open {port} ')]
        m = re.fullmatch(r'GYMUART open \d err (-?\d+) (-?\d+) (-?\d+) baud (\d+)', mine[0]) if mine else None
        check(f'UART{port} driver install / config / set_pin returned ESP_OK',
              m is not None and m.group(1) == m.group(2) == m.group(3) == '0',
              mine[0] if mine else 'no open line')
        check(f'UART{port} baud rate reads back 9600',
              m is not None and m.group(4) == '9600', mine[0] if mine else 'no open line')

    rx: list = []  # (t_ns, port, n, text)
    for t, text in lines:
        m = re.fullmatch(r'GYMRX (\d) (\d+) (\d+) (.*)', text)
        if m:
            rx.append((t, int(m.group(1)), int(m.group(3)), m.group(4)))

    def window(start_ns: int, end_ns: int, port: int) -> list:
        return [x for x in rx if x[1] == port and start_ns <= x[0] < end_ns]

    def echoed(start_ns: int, end_ns: int, port: int) -> bytes:
        return bytes(b for t, b in echo[port] if start_ns <= t < end_ns)

    def latency_after_last_byte_ms(got: list, at: int, data: bytes):
        return (got[0][0] - at - len(data) * FRAME_NS) / MS if got else None

    # Short burst on UART1: whole burst in one read, printed within the latency bound, echoed.
    name, uart, at, data = injections[0]
    got = window(at, at + 1000 * MS, 1)
    text = ''.join(x[3] for x in got)
    check('uart1 short burst: every byte reached uart_read_bytes',
          sum(x[2] for x in got) == len(data) and text == data.decode().replace('\r', '.').replace('\n', '.'),
          f'{sum(x[2] for x in got)} bytes in {len(got)} reads: {text!r}')
    latency_ms = latency_after_last_byte_ms(got, at, data)
    check(f'uart1 short burst: first read printed within {MAX_LATENCY_MS} ms after the last byte arrives',
          latency_ms is not None and 0 <= latency_ms <= MAX_LATENCY_MS,
          f'{latency_ms:.1f} ms' if latency_ms is not None else 'never printed')
    check('uart1 short burst: echoed back on UART1',
          echoed(at, at + 1000 * MS, 1) == data.replace(b'\r', b'.').replace(b'\n', b'.'),
          repr(echoed(at, at + 1000 * MS, 1)))

    # Long burst: paced, so the 128-byte FIFO never overflows.
    name, uart, at, data = injections[1]
    got = window(at, at + 1000 * MS, 1)
    total = sum(x[2] for x in got)
    check(f'uart1 {len(data)}-byte burst: every byte arrives',
          total == len(data) and ''.join(x[3] for x in got) == data.decode(),
          f'{total} bytes in {len(got)} reads')

    # UART2 after the switch.
    name, uart, at, data = injections[2]
    got = window(at, at + 1000 * MS, 2)
    text = ''.join(x[3] for x in got)
    check('uart2 short burst: every byte reached uart_read_bytes on UART2',
          sum(x[2] for x in got) == len(data),
          f'{sum(x[2] for x in got)} bytes in {len(got)} reads: {text!r}')
    latency2_ms = latency_after_last_byte_ms(got, at, data)
    check(f'uart2 short burst: first read printed within {MAX_LATENCY_MS} ms after the last byte arrives',
          latency2_ms is not None and 0 <= latency2_ms <= MAX_LATENCY_MS,
          f'{latency2_ms:.1f} ms' if latency2_ms is not None else 'never printed')
    check('uart2 short burst: echoed back on UART2',
          echoed(at, at + 1000 * MS, 2) == data.replace(b'\r', b'.').replace(b'\n', b'.'),
          repr(echoed(at, at + 1000 * MS, 2)))

    # UART1 with no driver: nothing printed, nothing echoed.
    name, uart, at, data = injections[3]
    got = window(at, at + 1000 * MS, 1)
    check('uart1 after the driver is deleted: nothing printed or echoed',
          not got and not echoed(at, at + 1000 * MS, 1), f'{len(got)} reads')

    print(f'serial: {len(lines)} console lines, {len(rx)} GYMRX; '
          f'echo bytes uart1={len(echo[1])} uart2={len(echo[2])}')
    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
