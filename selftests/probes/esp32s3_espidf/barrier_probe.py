"""esp_cloud /state barrier probe: guest data sent before a park reaches the peer
while the guest stays parked.

The harness parks the guest at each `at` and then calls GET /state?quiet_ms=50.
That only observes what the firmware sent before the park if the frame reaches
esp_cloud without the guest running again (the WiFi model hands it to slirp
from the vCPU's DMA write; slirp writes to the host socket directly when its
send buffer is empty).

The firmware (barrier_probe_fw/) joins "Espressif", connects to
mqtt.iot.test:1883, and publishes one message to toy/event once esp_timer
reaches 5 s, printing `PUB` right after send() returns. The toy peer
(docker/test/esp_cloud/toy) counts toy/event messages as `events`.

A discovery run finds T, the virtual time of the `PUB` line's first byte.
Then each of --runs fresh runs: /load the toy peer, boot, park at T - lead
(CONNACK printed, no PUB yet; /state: events == 0), park at T + margin
(PUB printed before the park; /state right away: events == 1), park 500 ms
later (still 1). If events == 0 at T + margin, the probe reports whether the
message shows up after a wall-clock wait (guest still parked) or only after
the guest runs again.

Runs inside the sim, which has esp_cloud on its network and the control token:
  docker exec -e PYTHONPATH=/app:/embedgym/parts embedgym-sim /opt/venv/bin/python \\
      /embedgym/selftests/probes/esp32s3_espidf/barrier_probe.py \\
      --worker /app/app/services/esp32_worker.py --lib /app/lib/libqemu-xtensa.so \\
      --firmware /embedgym/selftests/probes/esp32s3_espidf/barrier_probe_fw/compiled.bin
The toy peer stays loaded afterwards. Exit 0 = all checks pass.
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
import urllib.error
import urllib.request

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', '..', '..', 'velxio', 'backend', 'app',
                      'services', 'esp32_worker.py')

MS = 1_000_000  # ns per ms

DISCOVERY_MS = 8000
AFTER_MS = 500
# Network stamps drift up to ~0.55 ms between grading runs; the publish waits
# on a fixed esp_timer instant, so T should not move by more than a tick.
T_TOLERANCE_NS = 2 * MS


class Cloud:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip('/')
        self.token = token

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={'X-EmbedGym-Token': self.token,
                                              'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'{method} {path}: {e.code} {e.read().decode()}') from None

    def load(self, task_dir: str, target: str) -> dict:
        return self._request('POST', '/load', {'task_dir': task_dir, 'target': target})

    def state(self) -> tuple:
        """(state, wall seconds the call took)."""
        start = time.monotonic()
        values = self._request('GET', '/state?quiet_ms=50')
        return values, time.monotonic() - start


class Worker:
    """One esp32_worker.py process in grading mode with WiFi on."""

    def __init__(self, args: argparse.Namespace, fw_b64: str):
        self.proc = subprocess.Popen(
            [sys.executable, args.worker],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1,
        )
        self.events: 'queue.Queue[dict]' = queue.Queue()
        self.transcript: list = []
        threading.Thread(target=self._reader, daemon=True).start()
        self.send({
            'lib_path': os.path.abspath(args.lib),
            'firmware_b64': fw_b64,
            'machine': args.machine,
            'sensors': [],
            'wifi_enabled': True,
            'grading': True,
            'watched_pins': list(range(49)),
        })
        self.wait_for('system', timeout=60.0)  # {'event': 'booted'}

    def _reader(self) -> None:
        for line in self.proc.stdout:
            idx = line.find('{"type":')
            if idx < 0:
                continue
            try:
                ev = json.loads(line[idx:].strip())
            except Exception:
                continue
            self.transcript.append(ev)
            self.events.put(ev)

    def send(self, cmd: dict) -> None:
        self.proc.stdin.write(json.dumps(cmd) + '\n')
        self.proc.stdin.flush()

    def wait_for(self, type_: str, timeout: float = 30.0) -> dict:
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError(f'no {type_} within {timeout}s')
            try:
                ev = self.events.get(timeout=remaining)
            except queue.Empty:
                continue
            if ev.get('type') == type_:
                return ev
            if ev.get('type') == 'error':
                raise RuntimeError(f'worker error: {ev.get("message")}')

    def app_start(self) -> int:
        self.send({'cmd': 'run_to_app_start'})
        return self.wait_for('app_started', timeout=120.0)['t_ns']

    def run_to(self, t_ns: int) -> int:
        self.send({'cmd': 'run_to', 't_ns': t_ns})
        return self.wait_for('run_stopped', timeout=300.0)['t_ns']

    def settle(self) -> None:
        stable = 0
        seen = -1
        while stable < 3:
            time.sleep(0.2)
            now = len(self.transcript)
            stable = stable + 1 if now == seen else 0
            seen = now

    def lines(self) -> list:
        """UART0 lines as (first byte t_ns, text); a trailing partial line included."""
        out = []
        text = bytearray()
        first = None
        for e in self.transcript:
            if e.get('type') != 'uart_tx_t' or e.get('uart') != 0:
                continue
            if first is None:
                first = e['t_ns']
            if e['byte'] == 0x0A:
                out.append((first, text.decode('utf-8', errors='replace').rstrip('\r')))
                text = bytearray()
                first = None
            else:
                text.append(e['byte'])
        if first is not None:
            out.append((first, text.decode('utf-8', errors='replace')))
        return out

    def first(self, prefix: str):
        return next(((t, s) for t, s in self.lines() if s.startswith(prefix)), None)

    def stop(self) -> None:
        self.send({'cmd': 'stop'})
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--machine', default='esp32s3-picsimlab')
    ap.add_argument('--worker', default=os.path.normpath(WORKER))
    ap.add_argument('--cloud-base', default=os.environ.get('EMBEDGYM_CLOUD_BASE'))
    ap.add_argument('--token', default=os.environ.get('EMBEDGYM_CLOUD_TOKEN'))
    ap.add_argument('--task-dir', default='docker/test/esp_cloud/toy')
    ap.add_argument('--target', default='esp32s3_espidf')
    ap.add_argument('--runs', type=int, default=3)
    ap.add_argument('--margin-us', type=int, default=1000,
                    help='park this long after T; a park shifts later guest '
                         'timing by ~10 us, so under ~20 us it can land before PUB')
    ap.add_argument('--lead-ms', type=int, default=1000,
                    help='the negative check parks this long before T')
    args = ap.parse_args()
    if not args.cloud_base or not args.token:
        ap.error('--cloud-base and --token (or EMBEDGYM_CLOUD_BASE / EMBEDGYM_CLOUD_TOKEN) are required')

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()
    cloud = Cloud(args.cloud_base, args.token)

    failures: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    def boot() -> Worker:
        schema = cloud.load(args.task_dir, args.target)
        if 'events' not in schema['props']:
            raise RuntimeError(f'peer has no events prop: {schema}')
        state, _ = cloud.state()
        if state['events'] != 0:
            raise RuntimeError(f'events == {state["events"]} right after /load')
        worker = Worker(args, fw_b64)
        worker.app_start()
        return worker

    worker = boot()
    worker.run_to(DISCOVERY_MS * MS)
    worker.settle()
    pub = worker.first('PUB')
    detail = worker.first('GYMBARRIER')
    worker.stop()
    if pub is None:
        tail = [s for _, s in worker.lines()][-5:]
        print(f'PROBE FAIL (no PUB line by {DISCOVERY_MS} ms; serial tail: {tail})')
        return 1
    t_pub = pub[0]
    print(f'discovery: PUB first byte at {t_pub} ns; {detail[1] if detail else "no detail line"}')

    for run in range(1, args.runs + 1):
        tag = f'run {run}'
        worker = boot()

        before_ns = worker.run_to(t_pub - args.lead_ms * MS)
        state, wall = cloud.state()
        worker.settle()
        connack = worker.first('CONNACK')
        check(f'{tag}: connected before the negative park', connack is not None and connack[0] < before_ns,
              f'CONNACK at {connack[0] if connack else None} ns, park {before_ns} ns')
        check(f'{tag}: no PUB before the negative park', worker.first('PUB') is None)
        check(f'{tag}: events == 0 at T - {args.lead_ms} ms', state['events'] == 0,
              f'events={state["events"]} (/state took {wall * 1000:.0f} ms)')

        park_ns = worker.run_to(t_pub + args.margin_us * 1000)
        state, wall = cloud.state()
        worker.settle()
        pub = worker.first('PUB')
        check(f'{tag}: PUB printed before the park', pub is not None and pub[0] <= park_ns,
              f'{pub[1] if pub else None!r} at {pub[0] if pub else None} ns, park {park_ns} ns')
        if pub is not None:
            check(f'{tag}: T within {T_TOLERANCE_NS / MS:g} ms of discovery',
                  abs(pub[0] - t_pub) <= T_TOLERANCE_NS, f'T={pub[0]} (Δ {pub[0] - t_pub} ns)')
        check(f'{tag}: events == 1 at T + {args.margin_us} us, guest parked', state['events'] == 1,
              f'events={state["events"]} (/state took {wall * 1000:.0f} ms)')

        if state['events'] == 0:
            time.sleep(0.5)
            later, _ = cloud.state()
            print(f'  {tag}: still parked, after a further 0.5 s wall: events={later["events"]}')
            for extra_ms in (50, 500):
                worker.run_to(park_ns + extra_ms * MS)
                later, _ = cloud.state()
                print(f'  {tag}: after run_to park + {extra_ms} ms: events={later["events"]}')

        worker.run_to(park_ns + AFTER_MS * MS)
        state, _ = cloud.state()
        check(f'{tag}: events == 1 at T + {AFTER_MS} ms', state['events'] == 1,
              f'events={state["events"]}')
        worker.stop()

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
