"""SGP40 VOC gas sensor."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


SGP40_ADDR = 0x59
SGP40_CMD_SERIAL_NUMBER = 0x3682
SGP40_CMD_FEATURESET = 0x202F
SGP40_CMD_SELF_TEST = 0x280E
SGP40_CMD_MEASURE_RAW = 0x260F
SGP40_CMD_HEATER_OFF = 0x3615
SGP40_CMD_SOFT_RESET = 0x0006
# Below the datasheet maxima (320 / 30 ms) that Sensirion's driver waits for
# (a vTaskDelay of that many ms undershoots by up to a tick) and far below
# Adafruit's 500 / 250 ms.
SGP40_DURATION_NS = {
    SGP40_CMD_SERIAL_NUMBER: 0,
    SGP40_CMD_FEATURESET: 0,
    SGP40_CMD_SELF_TEST: 300 * 1_000_000,
    SGP40_CMD_MEASURE_RAW: 25 * 1_000_000,
}
SGP40_SELF_TEST_PASS = 0xD400
SGP40_FEATURESET = 0x0020
SGP40_SERIAL_NUMBER = (0x0000, 0x1234, 0x5678)
SGP40_MAX_RAW = 0xFFFF


def sensirion_crc8(data) -> int:
    """Sensirion CRC-8: poly 0x31, init 0xFF, MSB-first, no reflection or final XOR."""
    crc = 0xFF
    for byte in data:
        crc ^= byte & 0xFF
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def _sgp40_word(word: int) -> list[int]:
    """A 16-bit word as the master reads it: MSB, LSB, CRC over both."""
    msb = (word >> 8) & 0xFF
    lsb = word & 0xFF
    return [msb, lsb, sensirion_crc8([msb, lsb])]


class SGP40Slave:
    """SGP40 command-word I2C slave (address 0x59), a port of VirtualSGP40 in
    parts/sim/Sgp40.ts — the Sensirion protocol its
    spec comment lists (serial number, featureset, self-test, measure raw with
    CRC-checked humidity / temperature compensation words, heater off, soft
    reset), with the command execution times on the virtual clock.

    Each write transaction is one command; the result is read in a separate
    transaction (or after a repeated START, which reaches us as FINISH +
    START_RECV). One difference from the AVR part, whose bus cannot refuse an
    address: while a command is still executing, or when nothing is queued,
    the read header is NACKed the way the real part does it, so the driver
    sees ESP_FAIL and the pending result survives for a later read (QEMU's
    core follows a NACKed START with a FINISH, which must not count as the end
    of a read). Clocking out more bytes than a result holds reads 0xFF. Unsupported commands, a
    payload on a no-argument command, a bad compensation CRC and an
    out-of-range raw value raise ValueError (NACK + error frame).
    """

    def __init__(self, now_ns) -> None:
        self.addr = SGP40_ADDR
        self.raw = 30000
        self.now_ns = now_ns
        self.write_buf: list[int] = []
        self.read_buf: list[int] = []
        self.ready_at_ns = 0
        self.phase = 'idle'   # 'idle' | 'write' | 'read'
        self.heater_on = True
        self.humidity = 50.0
        self.temperature = 25.0

    def update(self, raw: float) -> None:
        """`set <role>.raw` — read at the next measure command."""
        self.raw = raw

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_SEND, I2C_START_RECV) and self.phase == 'write':
            # A repeated START ends the write as a STOP does.
            self._end_write()
        if op == I2C_START_SEND:
            self.write_buf = []
            self.phase = 'write'
            return 0
        elif op == I2C_START_RECV:
            if not self._result_ready():
                self.phase = 'idle'
                return 1
            self.phase = 'read'
            return 0
        elif op == I2C_WRITE:
            self.write_buf.append(data)
            return 0
        elif op == I2C_READ:
            if not self._result_ready():
                return 0xFF
            return self.read_buf.pop(0)
        elif op in (I2C_FINISH, I2C_NACK):
            if self.phase == 'write':
                self._end_write()
            elif self.phase == 'read':
                # A read transaction ending clears whatever the master left behind.
                self.read_buf = []
            self.phase = 'idle'
            return 0
        else:
            raise ValueError(f'sgp40: unsupported I2C event 0x{op:02x}')

    def _end_write(self) -> None:
        command = self.write_buf
        self.write_buf = []
        self.phase = 'idle'
        self._execute(command)

    def _result_ready(self) -> bool:
        return bool(self.read_buf) and self.now_ns() >= self.ready_at_ns

    # ── Commands ──────────────────────────────────────────────────────────────

    def _execute(self, data: list[int]) -> None:
        # A zero-length write is the driver probing for the address.
        if len(data) == 0:
            return
        if len(data) == 1:
            raise ValueError(f'sgp40: truncated command, got a single byte 0x{data[0]:02x}')
        command = (data[0] << 8) | data[1]
        payload = data[2:]
        if command == SGP40_CMD_MEASURE_RAW:
            self._start_measurement(payload)
            return
        if payload:
            raise ValueError(f'sgp40: command 0x{command:04x} takes no arguments, got {len(payload)} extra byte(s)')
        if command == SGP40_CMD_SERIAL_NUMBER:
            self._respond([b for w in SGP40_SERIAL_NUMBER for b in _sgp40_word(w)], SGP40_DURATION_NS[command])
        elif command == SGP40_CMD_FEATURESET:
            self._respond(_sgp40_word(SGP40_FEATURESET), SGP40_DURATION_NS[command])
        elif command == SGP40_CMD_SELF_TEST:
            self._respond(_sgp40_word(SGP40_SELF_TEST_PASS), SGP40_DURATION_NS[command])
        elif command == SGP40_CMD_HEATER_OFF:
            self.heater_on = False
            self._respond([], 0)
        elif command == SGP40_CMD_SOFT_RESET:
            self.heater_on = True
            self.humidity = 50.0
            self.temperature = 25.0
            self._respond([], 0)
        else:
            raise ValueError(f'sgp40: unsupported command 0x{command:04x}')

    def _start_measurement(self, payload: list[int]) -> None:
        if len(payload) != 6:
            raise ValueError('sgp40: measure raw signal takes 6 compensation bytes '
                             f'(RH word + CRC, T word + CRC), got {len(payload)}')
        if sensirion_crc8(payload[0:2]) != payload[2]:
            raise ValueError('sgp40: bad CRC on the humidity compensation word')
        if sensirion_crc8(payload[3:5]) != payload[5]:
            raise ValueError('sgp40: bad CRC on the temperature compensation word')
        humidity_ticks = (payload[0] << 8) | payload[1]
        temperature_ticks = (payload[3] << 8) | payload[4]
        self.humidity = humidity_ticks * 100 / 65535
        self.temperature = temperature_ticks * 175 / 65535 - 45
        # Measuring wakes the hotplate back up after a heater-off.
        self.heater_on = True

        raw = self.raw
        if not isinstance(raw, (int, float)) or not math.isfinite(raw) or raw < 0 or raw > SGP40_MAX_RAW:
            raise ValueError(f'sgp40: raw must be a number in 0..{SGP40_MAX_RAW}, got {raw}')
        self._respond(_sgp40_word(js_round(raw)), SGP40_DURATION_NS[SGP40_CMD_MEASURE_RAW])

    def _respond(self, data: list[int], duration_ns: int) -> None:
        self.read_buf = data
        self.ready_at_ns = self.now_ns() + duration_ns
