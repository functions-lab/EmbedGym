"""ADC-calibration eFuse probe for the ESP32-S3 grading worker.

Guards the eFuse image the worker hands QEMU (esp32_efuse_image.py). With a
zeroed eFuse block, IDF v4.4's esp_adc_cal_check_efuse() returns
ESP_ERR_INVALID_VERSION, esp_adc_cal_characterize() returns
ESP_ADC_CAL_VAL_NOT_SUPPORTED before filling the struct, and
esp_adc_cal_raw_to_voltage() converts every reading to 0 mV — a firmware that
trusts the API, as it may on silicon, reads 0 mV here. The image burns
BLK_VERSION_MAJOR = 1 and a calibration point per attenuation matching the
emulated ADC, so the API works and converts to within a few percent.

The firmware (adc_cal_probe_fw/) configures ADC1 channel 8 (GPIO9) at 11 dB,
prints `GYMCAL check=<esp_err> kind=<esp_adc_cal_value_t> coeff_a=<n>` once,
then `GYMADC <raw> <mV>` every 50 ms. The probe drives 1000 mV, then
1500 mV, and asserts the check passed, the characterization is the eFuse
two-point fit, and the converted mV is within TOLERANCE of the driven value.
The residual is IDF's curve-fitting polynomial (fitted to the real S3 ADC)
applied to QEMU's linear ADC: about -1 % at 1000 mV and -1.7 % at 1500 mV,
growing to -5 % at 3000 mV — see targets.md.

Usage:
  python3 selftests/probes/esp32s3_espidf/adc_cal_probe.py --lib <libqemu-xtensa.(so|dylib)> \
      --firmware selftests/probes/esp32s3_espidf/adc_cal_probe_fw/compiled.bin
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

ADC_CHANNEL = 8          # ADC1 channel 8 = GPIO9
DRIVES_MV = (1000, 1500)
PHASE_MS = 500
TOLERANCE = 0.02
ESP_OK = 0
ESP_ADC_CAL_VAL_EFUSE_TP_FIT = 3
# ~10 lines per 500 ms phase; the first two may carry a sample taken before
# the drive landed (the read and its print straddle the park).
SKIP_LINES = 2
MIN_LINES = 5


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

    def settle() -> None:
        # run_stopped is a barrier on the worker's stdout, but the reader
        # thread still has the backlog of uart_tx_t lines to parse.
        stable = 0
        seen = -1
        while stable < 3:
            time.sleep(0.2)
            now = len(transcript)
            stable = stable + 1 if now == seen else 0
            seen = now

    def serial_text(start: int, end: int) -> str:
        return bytes(e['byte'] for e in transcript[start:end]
                     if e.get('type') == 'uart_tx_t' and e.get('uart') == 0
                     ).decode('utf-8', errors='replace')

    failures: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    send(cfg)
    wait_for('system', timeout=60.0)  # {'event': 'booted'}

    send({'cmd': 'run_to_app_start'})
    now_ns = wait_for('app_started', timeout=120.0)['t_ns']

    phases: list = []
    for mv in DRIVES_MV:
        send({'cmd': 'set_adc', 'channel': ADC_CHANNEL, 'millivolts': mv})
        start = len(transcript)
        now_ns += PHASE_MS * MS
        send({'cmd': 'run_to', 't_ns': now_ns})
        wait_for('run_stopped', timeout=300.0)
        settle()
        phases.append((mv, serial_text(start, len(transcript))))

    send({'cmd': 'stop'})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    all_text = ''.join(text for _, text in phases)
    cal = re.search(r'GYMCAL check=(-?\d+) kind=(\d+) coeff_a=(\d+)', all_text)
    check('firmware printed its GYMCAL line', cal is not None)
    if cal is None:
        print(f'PROBE FAIL (serial tail: {all_text[-300:]!r})')
        return 1
    chk, kind, coeff_a = (int(g) for g in cal.groups())
    check('esp_adc_cal_check_efuse(EFUSE_TP_FIT) == ESP_OK', chk == ESP_OK,
          f'got {chk}')
    check('esp_adc_cal_characterize() == ESP_ADC_CAL_VAL_EFUSE_TP_FIT',
          kind == ESP_ADC_CAL_VAL_EFUSE_TP_FIT, f'got {kind}, coeff_a={coeff_a}')

    for mv, text in phases:
        lines = text.split('\n')[1:]  # the first piece may be a partial line
        readings = [(int(m.group(1)), int(m.group(2))) for m in
                    (re.fullmatch(r'GYMADC (\d+) (\d+)', ln.strip()) for ln in lines)
                    if m][SKIP_LINES:]
        check(f'{mv} mV: enough GYMADC lines to judge', len(readings) >= MIN_LINES,
              f'{len(readings)} lines over {PHASE_MS} ms')
        if not readings:
            continue
        raws = sorted({r for r, _ in readings})
        mvs = sorted({v for _, v in readings})
        check(f'{mv} mV: every reading within {TOLERANCE:.0%}',
              all(abs(v - mv) <= TOLERANCE * mv for v in mvs),
              f'raw {raws} -> {mvs} mV')

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
