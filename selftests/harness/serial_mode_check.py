"""Contract check for `run.sh --serial-ms` on the ESP target.

Serial mode is the agent's window into the sim (`embedgym-run` in docker/), and it
is the one ESP path a test.jsonl cannot grade: it parses no rows, so no
assertion row ever runs against it. Three properties are worth pinning:

  1. Timestamps use grading's app-start axis. The IDF boot log therefore
     appears at negative times, `app start` at 0 and the app's first print
     near 300 ms, where the firmware's own app-relative clock puts it.
  2. The boot log IS included. `linesAsOf` bounds the *parse* window at t>=0
     to keep boot lines out of assertions, and serial mode must keep reading
     the unfiltered store — an agent debugging a boot failure needs that spew.
  3. The app-start marker is stripped, in this mode as in every other. It is
     harness plumbing; a leaked `VLX-APP` would be noise the agent's sketch
     never printed.

Usage:
  python3 selftests/harness/serial_mode_check.py
      [--task selftests/harness/app_start_serial] [--serial-ms 1200]
Exit 0 = all checks pass. Requires the grading backend to be up (run.sh
healthchecks it).
"""
import argparse
import os
import re
import subprocess
import sys

# repo root, two levels up from selftests/harness/
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# The probe task prints "N: <n> T: <elapsed>" starting 300 ms after app start.
APP_LINE = re.compile(r'^N: (\d+) T: (\d+)$')
SERIAL_LINE = re.compile(r'^\[serial\] \[(-?\d+) ms\] (.*)$')

# Bootloader lines that must survive into a serial dump, before app start.
BOOT_MARKERS = ('ESP-ROM:', 'entry 0x')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--task', default='selftests/harness/app_start_serial')
    ap.add_argument('--serial-ms', type=int, default=1200)
    args = ap.parse_args()

    cmd = ['bash', 'run.sh', '--headless', '--serial-ms', str(args.serial_ms),
           args.task, 'esp32s3_espidf']
    print('$ ' + ' '.join(cmd))
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                          timeout=600)
    out = proc.stdout + proc.stderr

    failures = []

    def check(name: str, ok: bool, detail: str = '') -> None:
        print(f'[{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail else ''))
        if not ok:
            failures.append(name)

    check('run.sh exited 0', proc.returncode == 0, f'exit={proc.returncode}')

    lines = []
    for raw in out.splitlines():
        m = SERIAL_LINE.match(raw)
        if m:
            lines.append((int(m.group(1)), m.group(2)))
    check('serial lines were printed', bool(lines), f'{len(lines)} lines')
    if not lines:
        print('PROBE FAIL (no serial output)')
        return 1

    # 3: the marker never reaches the dump.
    check('app-start marker stripped',
          not any('VLX-APP' in text for _, text in lines))
    check('application INFO logs are visible',
          any('serial-probe: APP_INFO ' in text for _, text in lines))
    check('startup INFO logs stay disabled',
          not any('BOOT_INFO_MUST_STAY_QUIET' in text for _, text in lines))
    app_start = next((t for t, text in lines if text == 'app start'), None)
    check('no INFO log noise before app start', app_start is not None and
          not any(t < app_start and re.match(r'^I \(\d+\)', text) for t, text in lines))
    if args.serial_ms >= 12000:
        check('long run captures output after ten seconds',
              any(t > 10000 and 'serial-probe: LATE_INFO' in text for t, text in lines))

    # 1: app-start axis, and nothing past the window.
    check('app start line at 0 ms', app_start == 0, f't={app_start}')
    check('all lines within the requested window',
          all(t <= args.serial_ms for t, _ in lines),
          f'max={max(t for t, _ in lines)} > {args.serial_ms}'
          if any(t > args.serial_ms for t, _ in lines) else '')

    # 2: the boot log is present, early, and ahead of app start.
    for marker in BOOT_MARKERS:
        hits = [t for t, text in lines if text.startswith(marker)]
        check(f'boot log includes {marker!r}', bool(hits),
              f't={hits[0]}' if hits else 'absent')
        if hits:
            check(f'{marker!r} is at a negative time', hits[0] < 0,
                  f't={hits[0]}')

    # 1: the app's first print lands where its own app-relative clock says.
    app = [(t, int(m.group(2))) for t, text in lines
           if (m := APP_LINE.match(text))]
    check('app lines were printed', bool(app), f'{len(app)} lines')
    if app:
        t_axis, t_guest = app[0]
        check('first app print is near 300 ms', 280 <= t_axis <= 340,
              f't={t_axis} (guest says {t_guest})')
        check('stamp matches the guest-relative elapsed time',
              abs(t_axis - t_guest) <= 5, f'offset={t_axis - t_guest} ms')

    print('PROBE ' + ('PASS' if not failures else f'FAIL ({", ".join(failures)})'))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
