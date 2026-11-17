"""WebSocket plumbing probe for the nRF52840 grading path: drive the protocol
end-to-end through the running backend (simulation.py -> nrf52_manager ->
nrf52_worker) with the same blink_led_1hz gold as worker_probe.py, built by `run.sh`
(1 Hz on P1.15, starts ON, prints `LED ON` / `LED OFF`).

Checks: start_nrf52{grading} boots parked; esp32_run_to_app_start answers
app_started with t_ns 0; esp32_run_to answers run_stopped at the exact virtual
target; every uart_tx_t carries t_ns <= the park; esp32_gpio_in + esp32_sync
answers sync_done; P1.15 edges land at ~0/500/1000/1500 ms; esp32_adc_set
reaches the worker's SAADC (acked by the next esp32_sync); a message the
board cannot serve (esp32_i2c_response) answers an error event instead of
being dropped. Writes the frame sequence to --transcript so two runs can be
compared byte for byte.

Run with py312_native's `python` (Homebrew python3 lacks websockets).
Usage:
  python selftests/probes/nrf52840_zephyr/ws_probe.py --url ws://localhost:8001/api/simulation/ws/probe1 \
      --transcript /tmp/nrf_ws1.jsonl
Exit 0 = all checks pass.
"""
import argparse
import asyncio
import base64
import json
import os
import sys

import websockets

FIRMWARE = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', '..', '..', 'tasks', 'blink_led_1hz', 'nrf52840_zephyr', 'compiled.elf'))

MS = 1_000_000
LED_PIN = 47
BUTTON_PIN = 43
PARKS_MS = (100, 600, 1100, 1100.5)
EXPECTED_EDGES_MS = (0, 500, 1000, 1500)
EDGE_TOL_NS = 1 * MS


async def run(args: argparse.Namespace) -> int:
    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()

    failures: list = []
    transcript: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    async with websockets.connect(args.url, max_size=None) as ws:

        async def send(type_: str, data: dict) -> None:
            await ws.send(json.dumps({'type': type_, 'data': data}))

        async def recv(timeout: float = 60.0) -> dict:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
            transcript.append({'type': msg['type'], **msg['data']})
            return msg

        async def wait_for(type_: str, timeout: float = 60.0) -> dict:
            while True:
                msg = await recv(timeout)
                if msg['type'] == type_:
                    return msg['data']
                if msg['type'] == 'error':
                    raise RuntimeError(msg['data']['message'])

        await send('start_nrf52', {'board': args.board, 'firmware_b64': fw_b64,
                                   'sensors': [], 'grading': True,
                                   'watched_pins': list(range(48))})
        booting = await wait_for('system', timeout=90.0)
        check('booting relayed', booting['event'] == 'booting')
        booted = await wait_for('system', timeout=90.0)
        check('booted relayed', booted['event'] == 'booted')

        await send('esp32_run_to_app_start', {})
        started = await wait_for('app_started')
        check('app_started at t_ns 0 over WS', started['t_ns'] == 0, f't_ns={started["t_ns"]}')

        for target_ms in PARKS_MS:
            target_ns = int(target_ms * MS)
            await send('esp32_run_to', {'t_ns': target_ns})
            stopped = await wait_for('run_stopped')
            check(f'run_stopped at {target_ms} ms exact', stopped['t_ns'] == target_ns, f'got {stopped["t_ns"]}')
            late = [e for e in transcript if e['type'] == 'uart_tx_t' and e['t_ns'] > target_ns]
            check(f'no uart_tx_t beyond the {target_ms} ms park', not late, f'{len(late)} late frames')

        await send('esp32_gpio_in', {'pin': BUTTON_PIN, 'state': 1})
        await send('esp32_sync', {'id': 9})
        done = await wait_for('sync_done', timeout=30.0)
        check('sync_done id echo after gpio_in', done['id'] == 9)

        await send('esp32_adc_set', {'channel': 0, 'millivolts': 1000})
        await send('esp32_sync', {'id': 10})
        done = await wait_for('sync_done', timeout=30.0)
        check('sync_done id echo after adc_set', done['id'] == 10)

        await send('esp32_i2c_response', {'addr': 0x68, 'response': 0})
        msg = await recv(timeout=30.0)
        check('unsupported message answers an error event', msg['type'] == 'error',
              msg['type'] + ': ' + str(msg['data'].get('message', ''))[:80])

        await send('esp32_run_to', {'t_ns': 2000 * MS})
        stopped = await wait_for('run_stopped')
        check('run_stopped at 2000 ms exact', stopped['t_ns'] == 2000 * MS, f'got {stopped["t_ns"]}')

        edges = [e for e in transcript if e['type'] == 'gpio_change' and e['pin'] == LED_PIN]
        print('P1.15 edges:', ', '.join(f'{e["t_ns"] / MS:.3f} ms -> {e["state"]}' for e in edges))
        check('four P1.15 edges by the 2000 ms park', len(edges) == len(EXPECTED_EDGES_MS), f'{len(edges)} edges')
        for expected_ms, e in zip(EXPECTED_EDGES_MS, edges):
            check(f'P1.15 edge near {expected_ms} ms', abs(e['t_ns'] - expected_ms * MS) <= EDGE_TOL_NS,
                  f'{e["t_ns"] / MS:.3f} ms')

        stamped = [e for e in transcript if e['type'] == 'uart_tx_t']
        check('stamped serial arrived over WS', len(stamped) > 0, f'{len(stamped)} frames')
        serial = [e['data'] for e in transcript if e['type'] == 'serial_output']
        led_lines = [t.strip() for t in serial if t.startswith('LED ')]
        check('serial_output LED lines relayed',
              led_lines == ['LED ON', 'LED OFF', 'LED ON', 'LED OFF'], repr(led_lines))

        await send('stop_esp32', {})
        while True:
            try:
                await recv(timeout=1.0)
            except asyncio.TimeoutError:
                break

    with open(args.transcript, 'w') as f:
        for e in transcript:
            f.write(json.dumps(e, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} frames -> {args.transcript}')
    print('WS-PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--firmware', default=FIRMWARE)
    ap.add_argument('--board', default='nrf52840-dk')
    ap.add_argument('--transcript', default='/tmp/nrf52_ws_probe_transcript.jsonl')
    return asyncio.run(run(ap.parse_args()))


if __name__ == '__main__':
    sys.exit(main())
