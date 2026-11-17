"""M2 WebSocket plumbing probe: drive the grading protocol end-to-end through
the running backend (simulation.py -> esp32_lib_manager -> esp32_worker).

Checks: start_esp32{grading} boots parked; esp32_run_to_app_start answers
app_started; esp32_run_to answers run_stopped with the exact virtual target;
every uart_tx_t carries t_ns <= the park; esp32_sync answers sync_done. Writes the frame sequence to --transcript so two
runs can be compared with compare_transcripts.py.

Usage:
  python3 selftests/probes/esp32s3_espidf/ws_probe.py --url ws://localhost:8001/api/simulation/ws/probe1 \
      --firmware merged.bin [--board esp32-s3] --transcript /tmp/ws1.jsonl
Exit 0 = all checks pass.
"""
import argparse
import asyncio
import base64
import json
import sys

import websockets

MS = 1_000_000


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

        async def wait_for(type_: str, timeout: float = 60.0) -> dict:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout)
                msg = json.loads(raw)
                transcript.append({'type': msg['type'], **msg.get('data', {})})
                if msg['type'] == type_:
                    return msg.get('data', {})
                if msg['type'] == 'error':
                    raise RuntimeError(msg.get('data', {}).get('message'))

        await send('start_esp32', {
            'board': args.board, 'firmware_b64': fw_b64,
            'sensors': [], 'wifi_enabled': False, 'grading': True,
            'watched_pins': list(range(49)),
        })
        booted = await wait_for('system', timeout=90.0)
        check('booted', booted.get('event') in ('booting', 'booted'))
        if booted.get('event') == 'booting':
            booted = await wait_for('system', timeout=90.0)
            check('booted after booting', booted.get('event') == 'booted')

        await send('esp32_run_to_app_start', {})
        started = await wait_for('app_started', timeout=120.0)
        app_ns = started.get('t_ns', 0)
        check('app_started relayed over WS', 100 * MS <= app_ns <= 2000 * MS,
              f't_ns={app_ns}')

        for target_ms in (600, 1000, 1500):
            await send('esp32_run_to', {'t_ns': target_ms * MS})
            stopped = await wait_for('run_stopped', timeout=120.0)
            check(f'run_stopped at {target_ms} ms exact',
                  stopped.get('t_ns') == target_ms * MS,
                  f'got {stopped.get("t_ns")}')
            late = [e for e in transcript if e['type'] == 'uart_tx_t'
                    and e['t_ns'] > target_ms * MS]
            check(f'no uart_tx_t beyond the {target_ms} ms park', not late,
                  f'{len(late)} late frames' if late else '')

        await send('esp32_sync', {'id': 9})
        done = await wait_for('sync_done', timeout=30.0)
        check('sync_done id echo', done.get('id') == 9)

        stamped = [e for e in transcript if e['type'] == 'uart_tx_t']
        check('stamped serial arrived over WS', len(stamped) > 0,
              f'{len(stamped)} frames')

        await send('stop_esp32', {})

    with open(args.transcript, 'w') as f:
        for e in transcript:
            f.write(json.dumps(e, sort_keys=True) + '\n')
    print(f'transcript: {len(transcript)} frames -> {args.transcript}')
    print('WS-PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--board', default='esp32-s3')
    ap.add_argument('--transcript', default='/tmp/ws_probe_transcript.jsonl')
    return asyncio.run(run(ap.parse_args()))


if __name__ == '__main__':
    sys.exit(main())
