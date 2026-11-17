"""DS1307 real-time clock."""
from __future__ import annotations

import datetime
import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE


REG_SECONDS = 0x00
REG_HOURS = 0x02
REG_DAY = 0x03
REG_CONTROL = 0x07
REG_COUNT = 0x40
CLOCK_HALT = 0x80
HOUR_12 = 0x40
PM = 0x20
# The bits of seconds..year that hold the BCD value and its range; hours
# depends on its 12/24-hour bit.
FIELDS = (
    ('seconds', 0x7F, 0, 59), ('minutes', 0x7F, 0, 59), None, ('day', 0x07, 0, 7),
    ('date', 0x3F, 1, 31), ('month', 0x1F, 1, 12), ('year', 0xFF, 0, 99),
)
CONTROL_BITS = 0x93   # OUT, SQWE, RS1, RS0


def _bcd(n: int) -> int:
    return ((n // 10) << 4) | (n % 10)


def _from_bcd(b: int) -> int:
    return (b >> 4) * 10 + (b & 0x0F)


def _days_in_month(year: int, month: int) -> int:
    # The part's leap-year rule (valid through 2100): every year divisible by 4.
    if month == 2:
        return 29 if year % 4 == 0 else 28
    return 30 if month in (4, 6, 9, 11) else 31


class DS1307Slave:
    """DS1307 I2C RTC (address 0x68), a port of VirtualDS1307 in
    frontend/src/simulation/I2CBusManager.ts.

    The datasheet's 64-byte register file: seconds..year in BCD at 0x00-0x06,
    the control register at 0x07 (OUT, SQWE, RS1:0 stored and read back; the
    SQW/OUT pin is not driven), 56 bytes of RAM at 0x08-0x3F; the pointer
    wraps from 0x3F to 0x00. The first application of power loads 01/01/00,
    day 01, 00:00:00 with the clock-halt (CH) bit set and control 0x03; RAM
    reads 0x00 until written.

    While CH (bit 7 of seconds) is clear the clock counts whole seconds of
    `now_seconds()` (the worker injects the virtual clock), carrying through
    minutes, hours in the 12- or 24-hour mode that bit 6 of the hours register
    selects (bit 5 = PM in 12-hour mode), the day of week (a user counter,
    7 wraps to 1) and the date, month and year, every fourth year a leap year.
    Each written byte lands at once; writing the seconds register restarts
    the second. A transaction (from its START or repeated START) latches the
    time registers at its first time byte read, as the chip's secondary
    buffers do at the START, so a burst never tears across a second.
    `set_epoch()` and `set_running()` are the harness's `set <role>.epoch`
    and `set <role>.running`.

    An illogical time or date is undefined on the part, so a time register
    write outside its BCD range raises, as does counting on from a date past
    the end of its month. A register address past 0x3F raises.
    """

    POWER_ON_SECONDS = CLOCK_HALT
    SECONDS_BITS = 0xFF

    def __init__(self, now_seconds) -> None:
        self.addr = 0x68
        self.now_seconds = now_seconds
        self.regs = bytearray(REG_COUNT)
        self.regs[0:8] = bytes((self.POWER_ON_SECONDS, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x03))
        self.reg_ptr = 0
        self.first_byte = True
        # The divider chain restarted at second_origin; seconds_counted of the
        # whole seconds since then are in the registers.
        self.second_origin = 0.0
        self.seconds_counted = 0
        self._latched: bytes | None = None

    # ── Timekeeping ───────────────────────────────────────────────────────────

    def _sync(self, now: float) -> None:
        if self.regs[REG_SECONDS] & CLOCK_HALT:
            return
        elapsed = math.floor(now - self.second_origin)
        if elapsed <= self.seconds_counted:
            return
        for _ in range(elapsed - self.seconds_counted):
            self._tick()
        self.seconds_counted = elapsed

    def _tick(self) -> None:
        r = self.regs
        for reg in (0x00, 0x01):
            value = _from_bcd(r[reg])
            if value < 59:
                r[reg] = _bcd(value + 1)
                return
            r[reg] = 0x00
        if not self._next_hour():
            return
        r[REG_DAY] = r[REG_DAY] % 7 + 1
        date, month, year = _from_bcd(r[0x04]), _from_bcd(r[0x05]), _from_bcd(r[0x06])
        last = _days_in_month(year, month)
        if date > last:
            raise ValueError(f'ds1307: cannot count on from date {date} of month {month}, year {year:02d}; '
                             'the datasheet leaves an illogical date undefined')
        if date < last:
            r[0x04] = _bcd(date + 1)
            return
        r[0x04] = 0x01
        if month < 12:
            r[0x05] = _bcd(month + 1)
            return
        r[0x05] = 0x01
        r[0x06] = _bcd((year + 1) % 100)

    def _next_hour(self) -> bool:
        """Advance the hours register one hour; True when the day rolls over."""
        h = self.regs[REG_HOURS]
        if h & HOUR_12:
            hour, pm = _from_bcd(h & 0x1F), h & PM
            if hour == 11:
                self.regs[REG_HOURS] = HOUR_12 | (pm ^ PM) | _bcd(12)
                return pm != 0
            self.regs[REG_HOURS] = HOUR_12 | pm | _bcd(1 if hour == 12 else hour + 1)
            return False
        hour = _from_bcd(h)
        if hour == 23:
            self.regs[REG_HOURS] = 0x00
            return True
        self.regs[REG_HOURS] = _bcd(hour + 1)
        return False

    def set_epoch(self, epoch_seconds: float, at_seconds: float | None = None) -> None:
        """Pin the time registers to that instant's UTC wall-time fields, in
        the current 12/24-hour mode, day of week Sunday = 1, CH unchanged.
        `at_seconds` is the virtual time the drive belongs to — the harness's
        park, which the clock read overshoots once the vCPUs are stopped —
        else now; the second restarts there."""
        utc = datetime.datetime.fromtimestamp(math.floor(epoch_seconds), tz=datetime.timezone.utc)
        if self.regs[REG_HOURS] & HOUR_12:
            hours = HOUR_12 | (PM if utc.hour >= 12 else 0) | _bcd(utc.hour % 12 or 12)
        else:
            hours = _bcd(utc.hour)
        self.regs[0:7] = bytes((
            (self.regs[REG_SECONDS] & CLOCK_HALT) | _bcd(utc.second), _bcd(utc.minute), hours,
            utc.isoweekday() % 7 + 1, _bcd(utc.day), _bcd(utc.month), _bcd(utc.year % 100),
        ))
        self.second_origin = self.now_seconds() if at_seconds is None else at_seconds
        self.seconds_counted = 0

    def set_running(self, running: bool, at_seconds: float | None = None) -> None:
        """Clear (True) or set (False) CH at `at_seconds` (as in set_epoch),
        as a seconds write would: clearing it restarts the second there, and
        setting it holds the time counted up to then. Rewriting the bit's
        current state changes nothing."""
        at = self.now_seconds() if at_seconds is None else at_seconds
        halted = bool(self.regs[REG_SECONDS] & CLOCK_HALT)
        if running and halted:
            self.regs[REG_SECONDS] &= ~CLOCK_HALT
            self.second_origin = at
            self.seconds_counted = 0
        elif not running and not halted:
            self._sync(at)
            self.regs[REG_SECONDS] |= CLOCK_HALT

    # ── Registers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _check_time_field(reg: int, value: int) -> int:
        """The register value a time register write stores; raises when its
        BCD field is out of range."""
        if reg == REG_HOURS:
            bits, lo, hi = (0x1F, 1, 12) if value & HOUR_12 else (0x3F, 0, 23)
            name, stored = 'hours', value & 0x7F
        else:
            name, bits, lo, hi = FIELDS[reg]
            stored = value & bits
        field = value & bits
        if (field & 0x0F) > 9 or not lo <= _from_bcd(field) <= hi:
            raise ValueError(f'ds1307: {name} register write 0x{value:02x} is not BCD {lo}-{hi}; '
                             'the datasheet leaves an illogical time undefined')
        return stored

    def _write_reg(self, reg: int, value: int) -> None:
        if reg > REG_CONTROL:
            self.regs[reg] = value
            return
        if reg == REG_CONTROL:
            self.regs[reg] = value & CONTROL_BITS
            return
        stored = self._check_time_field(reg, value)
        now = self.now_seconds()
        self._sync(now)
        if reg == REG_SECONDS:
            self.regs[reg] = value & self.SECONDS_BITS
            # Writing seconds resets the divider chain.
            self.second_origin = now
            self.seconds_counted = 0
        else:
            self.regs[reg] = stored

    def _read_reg(self, reg: int) -> int:
        if reg >= REG_CONTROL:
            return self.regs[reg]
        if self._latched is None:
            self._sync(self.now_seconds())
            self._latched = bytes(self.regs[:REG_CONTROL])
        return self._latched[reg]

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND):
            # reg_ptr survives: a repeated START reaches us as FINISH + START.
            self.first_byte = True
            self._latched = None
            return 0
        elif op == I2C_WRITE:
            if self.first_byte:
                if data >= REG_COUNT:
                    raise ValueError(f'ds1307: register address 0x{data:02x} is past the last register 0x3f')
                self.reg_ptr = data
                self.first_byte = False
                return 0
            self._write_reg(self.reg_ptr, data)
            self.reg_ptr = (self.reg_ptr + 1) % REG_COUNT
            return 0
        elif op == I2C_READ:
            val = self._read_reg(self.reg_ptr)
            self.reg_ptr = (self.reg_ptr + 1) % REG_COUNT
            return val
        elif op in (I2C_FINISH, I2C_NACK):
            self.first_byte = True
            self._latched = None
            return 0
        else:
            raise ValueError(f'ds1307: unsupported I2C event 0x{op:02x}')
