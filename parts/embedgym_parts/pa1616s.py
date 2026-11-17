"""PA1616S GPS module (MTK3339, Adafruit Ultimate GPS v3). PA1616SModel is the
NMEA sentence generator and the PMTK command decoder; PA1616SModule puts it on
its pins and the clock.

Supported commands (anything else raises ValueError — no silent ACKs):
  PMTK220,<ms>    update interval, 100–10000 ms
  PMTK314,<19×n>  per-sentence output divisors (GLL/RMC/VTG/GGA/GSA/GSV only;
                  a non-zero divisor on fields 6–18 is unsupported);
                  PMTK314,-1 restores the default set
  PMTK251,9600    baud "change" to the rate the module already runs at
  PMTK605         firmware query → $PMTK705,...
  PGCMD,33,<0|1>  antenna advisory on/off → $PGTOP,11,3 per cycle when on

No fix ⇒ GGA quality 0 and RMC status V with empty position fields.
"""
from __future__ import annotations

import heapq
import itertools
import math

from embedgym_parts.uart import encode, same_framing

GPS_BAUD = 9600
FRAMING = {'baud': GPS_BAUD, 'data_bits': 8, 'parity': 'none', 'stop_bits': 1}
BYTE_NS = round(10 * 1e9 / GPS_BAUD)   # one 8N1 symbol on the wire
DEFAULT_INTERVAL_MS = 1000
# The FIX LED: 200 ms HIGH once a second while searching, once per 15 s with a
# fix. PPS: 100 ms HIGH once a second with a fix.
STATUS_PERIOD_NS = 1_000_000_000
FIX_HIGH_NS = 200_000_000
FIX_PERIOD_WITH_FIX_S = 15
PPS_HIGH_NS = 100_000_000

# Sentence order within one output cycle, matching a real MTK3339.
SENTENCES = ('GGA', 'GSA', 'GSV', 'RMC', 'VTG', 'GLL')
PMTK314_INDEX = {'GLL': 0, 'RMC': 1, 'VTG': 2, 'GGA': 3, 'GSA': 4, 'GSV': 5}
# Module default: GGA/GSA/GSV/RMC/VTG every cycle, GLL off.
DEFAULT_DIVISORS = {'GGA': 1, 'GSA': 1, 'GSV': 1, 'RMC': 1, 'VTG': 1, 'GLL': 0}

# Fixed, deterministic clock: the module boots at 2026-01-01 12:00:00.000 UTC.
BASE_TIME_MS = 12 * 3600 * 1000
NMEA_DATE = '010126'

STATE_KEYS = ('fix', 'latitude', 'longitude', 'satellites', 'altitude', 'speed', 'course')
DEFAULTS = {
    'fix': False, 'latitude': 37.7749, 'longitude': -122.4194, 'satellites': 8,
    'altitude': 12.5, 'speed': 0.0, 'course': 0.0,
}


def _to_fixed(value: float, digits: int) -> str:
    """JS Number.prototype.toFixed: round half away from zero."""
    scaled = abs(value) * 10 ** digits
    n = math.floor(scaled + 0.5)
    text = f'{n / 10 ** digits:.{digits}f}'
    return '-' + text if value < 0 and n != 0 else text


def nmea_wrap(body: str) -> str:
    cs = 0
    for ch in body:
        cs ^= ord(ch)
    return f'${body}*{cs:02X}\r\n'


def nmea_coord(value: float, is_lat: bool) -> tuple[str, str]:
    """Decimal degrees → NMEA ddmm.mmmm (lat) / dddmm.mmmm (lon) + hemisphere."""
    if is_lat:
        hemi = 'S' if value < 0 else 'N'
    else:
        hemi = 'W' if value < 0 else 'E'
    abs_value = abs(value)
    deg = math.floor(abs_value)
    minutes = (abs_value - deg) * 60
    deg_str = str(deg).zfill(2 if is_lat else 3)
    min_str = _to_fixed(minutes, 4).zfill(7)
    return f'{deg_str}{min_str}', hemi


def nmea_time(sim_ms: float) -> str:
    t = BASE_TIME_MS + math.floor(sim_ms)
    hh = (t // 3600000) % 24
    mm = (t // 60000) % 60
    ss = (t // 1000) % 60
    ms = t % 1000
    return f'{hh:02d}{mm:02d}{ss:02d}.{ms:03d}'


def build_sentence(kind: str, s: dict, sim_ms: float) -> str:
    t = nmea_time(sim_ms)
    lat, lat_hemi = nmea_coord(s['latitude'], True)
    lon, lon_hemi = nmea_coord(s['longitude'], False)
    sats = str(max(0, round(s['satellites']))).zfill(2)
    speed = _to_fixed(s['speed'], 2)
    kmh = _to_fixed(s['speed'] * 1.852, 2)
    course = _to_fixed(s['course'], 2)
    fix = s['fix']

    if kind == 'GGA':
        if fix:
            return (f'GPGGA,{t},{lat},{lat_hemi},{lon},{lon_hemi},1,{sats},1.2,'
                    f'{_to_fixed(s["altitude"], 1)},M,0.0,M,,')
        return f'GPGGA,{t},,,,,0,00,,,M,,M,,'
    elif kind == 'GSA':
        return 'GPGSA,A,3,01,02,03,04,,,,,,,,,2.4,1.2,1.9' if fix else 'GPGSA,A,1,,,,,,,,,,,,,,,'
    elif kind == 'GSV':
        return 'GPGSV,1,1,04,01,40,083,41,02,17,308,43,03,07,344,39,04,22,228,45'
    elif kind == 'RMC':
        if fix:
            return f'GPRMC,{t},A,{lat},{lat_hemi},{lon},{lon_hemi},{speed},{course},{NMEA_DATE},,,A'
        return f'GPRMC,{t},V,,,,,0.00,0.00,{NMEA_DATE},,,N'
    elif kind == 'VTG':
        return f'GPVTG,{course},T,,M,{speed},N,{kmh},K,A' if fix else 'GPVTG,0.00,T,,M,0.00,N,0.00,K,N'
    elif kind == 'GLL':
        return f'GPGLL,{lat},{lat_hemi},{lon},{lon_hemi},{t},A,A' if fix else f'GPGLL,,,,,{t},V,N'
    raise ValueError(f'pa1616s: unknown sentence kind {kind}')


class PA1616SModel:
    def __init__(self, **values) -> None:
        self.state = dict(DEFAULTS)
        self.interval_ms = DEFAULT_INTERVAL_MS
        self.divisors = dict(DEFAULT_DIVISORS)
        self.antenna_advisory = False
        self.cycle_count = 0
        self.update(values)

    # ── Sensor control panel / test harness drives ───────────────────────────
    def update(self, values: dict) -> None:
        for key, value in values.items():
            if key == 'fix':
                self.state['fix'] = bool(value)
            elif key in ('latitude', 'longitude', 'satellites', 'altitude', 'speed', 'course'):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError(f'pa1616s: {key} must be a finite number, got {value!r}')
                self.state[key] = float(value)
            else:
                raise ValueError(f'pa1616s: unknown property "{key}"')

    # ── Module → guest: one output cycle ─────────────────────────────────────
    def emit_cycle(self, sim_ms: float) -> bytes:
        self.cycle_count += 1
        batch = ''
        for kind in SENTENCES:
            div = self.divisors[kind]
            if div > 0 and self.cycle_count % div == 0:
                batch += nmea_wrap(build_sentence(kind, self.state, sim_ms))
        if self.antenna_advisory:
            batch += nmea_wrap('PGTOP,11,3')
        return batch.encode('ascii')

    # ── Guest → module: PMTK command decoding ────────────────────────────────
    def handle_command(self, line: str) -> bytes:
        if not line.startswith('$'):
            raise ValueError(f'pa1616s: received non-NMEA line "{line}"')
        star = line.find('*')
        if star >= 0:
            body = line[1:star]
            cs = 0
            for ch in body:
                cs ^= ord(ch)
            if int(line[star + 1:], 16) != cs:
                raise ValueError(f'pa1616s: bad checksum on "{line}"')
        else:
            body = line[1:]
        fields = body.split(',')
        cmd = fields[0]

        if cmd == 'PMTK220':
            try:
                ms = float(fields[1])
            except (IndexError, ValueError):
                ms = math.nan
            if not math.isfinite(ms) or ms < 100 or ms > 10000:
                raise ValueError(f'pa1616s: PMTK220 interval {fields[1:2]} out of range (100–10000 ms)')
            self.interval_ms = ms
            return nmea_wrap('PMTK001,220,3').encode('ascii')
        elif cmd == 'PMTK314':
            if len(fields) == 2 and fields[1] == '-1':
                self.divisors = dict(DEFAULT_DIVISORS)
            else:
                if len(fields) < 20:
                    raise ValueError(f'pa1616s: PMTK314 expects 19 fields, got {len(fields) - 1}')
                values = [int(f) if f.lstrip('-').isdigit() else math.nan for f in fields[1:]]
                for i in range(6, 19):
                    if values[i] != 0:
                        raise ValueError(f'pa1616s: PMTK314 field {i} (non-position sentence) unsupported')
                for kind in SENTENCES:
                    v = values[PMTK314_INDEX[kind]]
                    if not isinstance(v, int) or v < 0 or v > 5:
                        raise ValueError(f'pa1616s: PMTK314 divisor {v} for {kind} invalid')
                    self.divisors[kind] = v
            return nmea_wrap('PMTK001,314,3').encode('ascii')
        elif cmd == 'PMTK251':
            if len(fields) < 2 or not fields[1].isdigit() or int(fields[1]) != GPS_BAUD:
                raise ValueError(f'pa1616s: baud change to {fields[1:2]} unsupported (module runs at 9600)')
            return nmea_wrap('PMTK001,251,3').encode('ascii')
        elif cmd == 'PMTK605':
            return nmea_wrap('PMTK705,AXN_2.10_3339_2013072601,5632,PA6H,1.0').encode('ascii')
        elif cmd == 'PGCMD':
            if len(fields) < 3 or fields[1] != '33' or fields[2] not in ('0', '1'):
                raise ValueError(f'pa1616s: unsupported PGCMD "{line}"')
            self.antenna_advisory = fields[2] == '1'
            return nmea_wrap('PGACK,33,1').encode('ascii')
        raise ValueError(f'pa1616s: unsupported command "{line}"')


class PA1616SModule:
    """The module on its pins, counted from its time origin (`start`): an
    output cycle every update interval and, while FIX or PPS is wired, the
    status pulses every second. Its bytes leave TX one 8N1 frame apart at 9600
    baud, a reply queued behind the cycle being sent, and each reaches the
    firmware's UART at its frame end: through `deliver(byte)` when
    `receiver()` reports one listening on TX, else it is lost. A receiver, or
    a firmware UART sending on RX, at another framing raises. On a host with
    no UART on its pins, `wire` is a embedgym_parts/pin_uart.py PinUart instead, and
    each frame is driven on it from its start. The bytes on RX assemble into
    the commands the module answers.

    `arm(due_ns)` asks for `tick(now_ns)` at the earliest deadline; `fix` and
    `pps` are drive(high, at_ns) or None when unwired."""

    def __init__(self, now_ns, receiver, deliver, arm, fix, pps) -> None:
        self.model = PA1616SModel()
        self.now_ns = now_ns
        self.receiver = receiver
        self.deliver = deliver
        self.arm = arm
        self.fix = fix
        self.pps = pps
        self.wire = None
        self.events: list = []  # (due_ns, seq, kind, byte)
        self.seq = itertools.count()
        self.origin_ns = 0
        self.tx_free_ns = 0
        self.seconds = 0
        self.rx = bytearray()

    def update(self, values: dict) -> None:
        self.model.update(values)

    def start(self, origin_ns: int) -> None:
        self.origin_ns = origin_ns
        self._push(origin_ns + round(self.model.interval_ms * 1e6), 'cycle')
        if self.fix is not None or self.pps is not None:
            self._push(origin_ns + STATUS_PERIOD_NS, 'second')
        self._arm()

    def tick(self, now_ns: int) -> None:
        """Run every event due by `now_ns`, each at its own deadline."""
        while self.events and self.events[0][0] <= now_ns:
            due, _, kind, byte = heapq.heappop(self.events)
            if kind == 'byte':
                self._arrive(byte)
            elif kind == 'cycle':
                self._send(due, self.model.emit_cycle((due - self.origin_ns) / 1e6))
                self._push(due + round(self.model.interval_ms * 1e6), 'cycle')
            elif kind == 'second':
                self._second(due)
            else:
                raise RuntimeError(f'pa1616s: unknown event {kind!r}')
        self._arm()

    def on_byte(self, byte: int, framing: dict) -> None:
        """The firmware's UART sent `byte` toward RX with `framing`."""
        self._check(framing, 'sends')
        if byte != 0x0A:
            self.rx.append(byte)
            return
        line = self.rx.decode('ascii').rstrip('\r')
        self.rx.clear()
        if line:
            self._send(self.now_ns(), self.model.handle_command(line))
            self._arm()

    def _check(self, framing: dict, verb: str) -> None:
        if not same_framing(FRAMING, framing):
            raise ValueError(f"pa1616s: the firmware's UART {verb} at {framing}; the module talks 8N1 at {GPS_BAUD} baud")

    def _push(self, due_ns: int, kind: str, byte: int = 0) -> None:
        heapq.heappush(self.events, (due_ns, next(self.seq), kind, byte))

    def _arm(self) -> None:
        if self.events:
            self.arm(self.events[0][0])

    def _send(self, at_ns: int, data: bytes) -> None:
        start = max(at_ns, self.tx_free_ns)
        # A byte reaches a UART at its frame end; on a wire its frame starts then.
        end = 0 if self.wire is not None else 1
        for i, byte in enumerate(data):
            self._push(start + (i + end) * BYTE_NS, 'byte', byte)
        self.tx_free_ns = start + len(data) * BYTE_NS

    def _arrive(self, byte: int) -> None:
        if self.wire is not None:
            self.wire.send(encode('pa1616s', byte, FRAMING), 1e9 / GPS_BAUD)
            return
        framing = self.receiver()
        if framing is not None:
            self._check(framing, 'receives')
            self.deliver(byte)

    def _second(self, due: int) -> None:
        self.seconds += 1
        fix = self.model.state['fix']
        if self.fix is not None and (not fix or self.seconds % FIX_PERIOD_WITH_FIX_S == 0):
            self.fix(True, due)
            self.fix(False, due + FIX_HIGH_NS)
        if self.pps is not None and fix:
            self.pps(True, due)
            self.pps(False, due + PPS_HIGH_NS)
        self._push(due + STATUS_PERIOD_NS, 'second')
