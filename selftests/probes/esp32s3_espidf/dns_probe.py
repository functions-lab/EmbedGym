"""Guest DNS probe: the esp_cloud hostnames resolve from inside the guest.

curl from the sim does not cover this: the guest asks slirp's DNS (192.168.4.3),
which forwards to the sim's Docker resolver. The firmware (dns_probe_fw/) joins
"Espressif", prints `DNS <name> <ip>` per address (or `DNS <name> FAIL <rc>`),
then GETs http://api.iot.test/nope and prints the status line and the Date
header as `HTTP <line>`. esp_cloud answers an unknown path with 404 and its
fixed Date, whether a peer is loaded or not.

Expected addresses come from the host, where docker inspect works:
  ip() { docker inspect -f '{{(index .NetworkSettings.Networks "esp_cloud_net").IPAddress}}' $1; }
  docker exec -e PYTHONPATH=/app:/embedgym/parts embedgym-sim /opt/venv/bin/python \\
      /embedgym/selftests/probes/esp32s3_espidf/dns_probe.py \\
      --worker /app/app/services/esp32_worker.py --lib /app/lib/libqemu-xtensa.so \\
      --firmware /embedgym/selftests/probes/esp32s3_espidf/dns_probe_fw/compiled.bin \\
      --expect mqtt.iot.test=$(ip esp_cloud) ... --expect embedgym-sim=<ip>,<ip>
An --expect value lists every address the name may resolve to (the sim is on
two networks). Exit 0 = every name resolves only to its expected addresses
and the HTTP response is as above.
"""
import argparse
import base64
import os
import re
import sys

from barrier_probe import MS, WORKER, Worker

NAMES = ('mqtt.iot.test', 'api.iot.test', 'ntp.iot.test', 'coap.iot.test',
         'pg.iot.test', 'embedgym-sim', 'esp_cloud')
DEADLINE_MS = 20000
STEP_MS = 1000
FIXED_DATE = 'Date: Mon, 01 Jan 2024 00:00:00 GMT'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--firmware', required=True)
    ap.add_argument('--machine', default='esp32s3-picsimlab')
    ap.add_argument('--worker', default=os.path.normpath(WORKER))
    ap.add_argument('--expect', action='append', default=[], metavar='NAME=IP[,IP]')
    args = ap.parse_args()
    expected = {}
    for item in args.expect:
        name, ips = item.split('=', 1)
        if name not in NAMES:
            ap.error(f'--expect {name}: not one of {NAMES}')
        expected[name] = set(ips.split(','))
    missing = [n for n in NAMES if n not in expected]
    if missing:
        ap.error(f'no --expect for {missing}')

    with open(args.firmware, 'rb') as f:
        fw_b64 = base64.b64encode(f.read()).decode()

    failures: list = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    worker = Worker(args, fw_b64)
    now_ns = worker.app_start()
    while worker.first('GYMDNS DONE') is None and now_ns < DEADLINE_MS * MS:
        now_ns = worker.run_to(now_ns + STEP_MS * MS)
        worker.settle()
    lines = worker.lines()
    worker.stop()

    for t_ns, text in lines:
        if text.startswith(('DNS ', 'HTTP ', 'GYMDNS')):
            print(f'  {t_ns / MS:9.3f} ms  {text}')
    check('firmware finished', any(s == 'GYMDNS DONE' for _, s in lines),
          f'by {now_ns / MS:.0f} ms')

    resolved = {}
    for _, text in lines:
        m = re.fullmatch(r'DNS (\S+) (.+)', text)
        if m:
            resolved.setdefault(m.group(1), []).append(m.group(2))
    for name in NAMES:
        got = resolved.get(name, [])
        check(f'{name} resolves to {sorted(expected[name])}',
              bool(got) and set(got) <= expected[name], f'got {got}')

    http = [s[len('HTTP '):] for _, s in lines if s.startswith('HTTP ')]
    check('GET /nope answers 404', bool(http) and re.match(r'HTTP/1\.[01] 404 ', http[0]) is not None,
          f'{http[0] if http else None!r}')
    check('Date header is the fixed date', FIXED_DATE in http, f'{http}')

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
