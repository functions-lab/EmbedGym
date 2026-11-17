"""DS18B20 1-Wire temperature sensor.

Ds18b20Slave decodes the bus from level edges stamped in virtual ns:
master-driven slots are classified by their LOW duration (reset >= 400 us;
otherwise the slot's bit is the line level at the datasheet's typical 30 us
sample point, so a LOW shorter than 30 us is a 1); slave-driven replies
(presence pulse, read-slot 0-bits) are requested through `drive(low, at_ns)`
and the host lands them on its clock. The host (embedgym_parts/registry.py's `line`)
owns the wired-AND of the firmware's pin and this slave's level and feeds the
result to `on_line`.

Datasheet behaviors modeled (Maxim DS18B20, "ROM commands" / "function
commands"):
  ROM:      0xF0 Search (one device, so no discrepancy bits), 0x55 Match (a
            mismatched bit deselects the part until the next reset), 0xCC
            Skip, 0x33 Read ROM (selects the part, so a function command may
            follow), 0xEC Alarm Search (the part joins only while its alarm
            flag is set).
  Function: 0x44 Convert T samples the supplied temperature when issued;
            when the conversion ends it lands in the scratchpad at the
            configured resolution and refreshes the alarm flag (integer part
            >= TH or <= TL). 0xBE Read Scratchpad (9 bytes, CRC-8 last;
            mid-conversion it still holds the previous reading), 0x4E Write
            Scratchpad (TH, TL, config -- only R1/R0 in the config byte are
            writable, the rest read as 1), 0x48 Copy Scratchpad -> EEPROM,
            0xB8 Recall E2 -> scratchpad (instant), 0xB4 Read Power Supply
            (read slot idles HIGH = externally powered).
  Busy:     after Convert T, Copy Scratchpad or Recall E2, read slots answer
            0 while the operation runs and 1 once done. A conversion takes
            600 ms at 12 bits, halving per bit below (typical silicon; the
            datasheet only gives the 750 ms maximum); an EEPROM copy takes the
            typical 2 ms. A Convert T or Copy Scratchpad issued while either
            is running is ignored.
  Power-on: EEPROM TH 0x4B / TL 0x46 / config 0x7F (12-bit), temperature
            register 0x0550 (+85 C) until the first conversion.
  Resolution: 9-12 bits; the undefined low bits of the temperature register
            read 0.

A ROM or function command outside that list raises ValueError.
"""
from __future__ import annotations

import math
from typing import Callable, List


def crc8(data, length: int) -> int:
    """Dallas/Maxim CRC-8 (poly 0x8C, LSB first)."""
    crc = 0
    for i in range(length):
        b = data[i]
        for _ in range(8):
            mix = (crc ^ b) & 1
            crc >>= 1
            if mix:
                crc ^= 0x8C
            b >>= 1
    return crc


CMD_SEARCH_ROM = 0xF0
CMD_READ_ROM = 0x33
CMD_MATCH_ROM = 0x55
CMD_SKIP_ROM = 0xCC
CMD_ALARM_SEARCH = 0xEC
CMD_CONVERT_T = 0x44
CMD_WRITE_SCRATCHPAD = 0x4E
CMD_READ_SCRATCHPAD = 0xBE
CMD_COPY_SCRATCHPAD = 0x48
CMD_RECALL_E2 = 0xB8
CMD_READ_POWER_SUPPLY = 0xB4

SP_TEMP_LSB = 0
SP_TEMP_MSB = 1
SP_TH = 2
SP_TL = 3
SP_CONFIG = 4
SP_CRC = 8

POWER_ON_TEMP_RAW = 0x0550  # +85 C
EEPROM_DEFAULTS = (0x4B, 0x46, 0x7F)

RESET_MIN_NS = 400_000
WRITE_SAMPLE_NS = 30_000
PRESENCE_SLACK_NS = 15_000
PRESENCE_START_NS = 30_000
PRESENCE_LEN_NS = 100_000
READ0_HOLD_NS = 30_000
CONVERSION_12BIT_NS = 600_000_000
EEPROM_COPY_NS = 2_000_000


def _signed8(b: int) -> int:
    return b - 256 if b & 0x80 else b


class Ds18b20Slave:
    """DS18B20 (family 0x28), VDD-powered. States: IDLE also covers
    "deselected" -- read slots go undriven, so the master reads 1. BUSY_POLL
    follows Convert T / Copy Scratchpad / Recall E2: read slots report whether
    the operation is still running."""

    def __init__(self, get_temperature: Callable[[], float],
                 drive: Callable[[bool, int], None],
                 write_sample_ns: int = WRITE_SAMPLE_NS,
                 read0_hold_ns: int = READ0_HOLD_NS) -> None:
        self._get_temperature = get_temperature
        self._drive = drive
        # The datasheet allows both anywhere in 15-60 us; a slow emulated host needs later points.
        self._write_sample_ns = write_sample_ns
        self._read0_hold_ns = read0_hold_ns
        self.rom = [0x28, 0x84, 0x9C, 0xA2, 0x17, 0x05, 0x00, 0]
        self.rom[7] = crc8(self.rom, 7)
        self.scratchpad = bytearray(9)
        self.eeprom = bytearray(EEPROM_DEFAULTS)
        self.alarm_flag = False

        self._state = 'IDLE'
        self._after_send = 'IDLE'
        self._rx_byte = 0
        self._rx_bits = 0
        self._tx_buf: List[int] = []
        self._tx_bit = 0
        self._search_idx = 0    # bit 0..63
        self._search_phase = 0  # 0 = bit, 1 = complement, 2 = master's direction bit
        self._dir_fall_seen = False
        self._match_idx = 0
        self._match_ok = True
        self._sp_idx = 0

        self._last_fall = 0
        self._line_low = False
        self._gate_until = 0  # our own presence pulse: ignore the edges we cause
        self._now = 0
        self._busy_until = 0
        self._pending_raw = None  # conversion result not yet in the scratchpad

        self.scratchpad[SP_TEMP_LSB] = POWER_ON_TEMP_RAW & 0xFF
        self.scratchpad[SP_TEMP_MSB] = POWER_ON_TEMP_RAW >> 8
        self.scratchpad[SP_TH:SP_CONFIG + 1] = self.eeprom
        self.scratchpad[5] = 0xFF
        self.scratchpad[6] = 0x0C
        self.scratchpad[7] = 0x10
        self.scratchpad[SP_CRC] = crc8(self.scratchpad, 8)

    # ── public ────────────────────────────────────────────────────────────

    def on_line(self, high: bool, now_ns: int) -> None:
        """Every transition of the bus level, stamped in virtual ns."""
        self._now = now_ns
        if self._pending_raw is not None and now_ns >= self._busy_until:
            self._finish_conversion(self._pending_raw)
        if now_ns < self._gate_until:
            return
        if not high:
            if self._line_low:
                return
            self._line_low = True
            self._last_fall = now_ns
            self._on_fall(now_ns)
        elif self._line_low:
            self._line_low = False
            self._on_rise(now_ns, now_ns - self._last_fall)

    @property
    def resolution_bits(self) -> int:
        return 9 + ((self.scratchpad[SP_CONFIG] >> 5) & 3)

    @property
    def temperature_raw(self) -> int:
        return (self.scratchpad[SP_TEMP_MSB] << 8) | self.scratchpad[SP_TEMP_LSB]

    # ── internals ─────────────────────────────────────────────────────────

    def _rom_bit(self, i: int) -> int:
        return (self.rom[i >> 3] >> (i & 7)) & 1

    def _answer_read0(self, now_ns: int) -> None:
        self._drive(True, now_ns)
        self._drive(False, now_ns + self._read0_hold_ns)

    def _start_conversion(self) -> None:
        undefined_bits = 12 - self.resolution_bits
        # math.floor(x + 0.5) is JS Math.round; Python's round() is half-to-even.
        self._pending_raw = (math.floor(self._get_temperature() * 16 + 0.5) & 0xFFFF) & ((0xFFFF << undefined_bits) & 0xFFFF)
        self._busy_until = self._now + (CONVERSION_12BIT_NS >> undefined_bits)

    def _finish_conversion(self, raw: int) -> None:
        self._pending_raw = None
        self.scratchpad[SP_TEMP_LSB] = raw & 0xFF
        self.scratchpad[SP_TEMP_MSB] = raw >> 8
        self.scratchpad[SP_CRC] = crc8(self.scratchpad, 8)
        # TH/TL compare against the integer part only (register bits 11..4), as signed bytes.
        whole_degrees = (raw - 0x10000 if raw & 0x8000 else raw) >> 4
        th = _signed8(self.scratchpad[SP_TH])
        tl = _signed8(self.scratchpad[SP_TL])
        self.alarm_flag = whole_degrees >= th or whole_degrees <= tl

    def _begin_send(self, data, then: str) -> None:
        self._state = 'SEND'
        self._after_send = then
        self._tx_buf = list(data)
        self._tx_bit = 0

    def _begin_search(self) -> None:
        self._state = 'SEARCH'
        self._search_idx = 0
        self._search_phase = 0
        self._dir_fall_seen = False

    def _on_rom_command(self, byte: int) -> None:
        if byte == CMD_SKIP_ROM:
            self._state = 'FUNC_CMD'
        elif byte == CMD_READ_ROM:
            self._begin_send(self.rom, 'FUNC_CMD')
        elif byte == CMD_SEARCH_ROM:
            self._begin_search()
        elif byte == CMD_ALARM_SEARCH:
            if self.alarm_flag:
                self._begin_search()
            else:
                self._state = 'IDLE'
        elif byte == CMD_MATCH_ROM:
            self._state = 'MATCH'
            self._match_idx = 0
            self._match_ok = True
        else:
            raise ValueError(f'ds18b20: unsupported ROM command 0x{byte:x}')

    def _on_function_command(self, byte: int) -> None:
        busy = self._now < self._busy_until
        if byte == CMD_CONVERT_T:
            if not busy:
                self._start_conversion()
            self._state = 'BUSY_POLL'
        elif byte == CMD_READ_SCRATCHPAD:
            self._begin_send(self.scratchpad, 'IDLE')
        elif byte == CMD_WRITE_SCRATCHPAD:
            self._state = 'WRITE_SP'
            self._sp_idx = 0
        elif byte == CMD_COPY_SCRATCHPAD:
            if not busy:
                self.eeprom[:] = self.scratchpad[SP_TH:SP_CONFIG + 1]
                self._busy_until = self._now + EEPROM_COPY_NS
            self._state = 'BUSY_POLL'
        elif byte == CMD_RECALL_E2:
            self.scratchpad[SP_TH:SP_CONFIG + 1] = self.eeprom
            self.scratchpad[SP_CRC] = crc8(self.scratchpad, 8)
            self._state = 'BUSY_POLL'
        elif byte == CMD_READ_POWER_SUPPLY:
            self._state = 'IDLE'
        else:
            raise ValueError(f'ds18b20: unsupported function command 0x{byte:x}')

    def _on_scratchpad_byte(self, byte: int) -> None:
        if self._sp_idx == 2:
            byte = (byte & 0x60) | 0x1F
        self.scratchpad[SP_TH + self._sp_idx] = byte
        self._sp_idx += 1
        if self._sp_idx == 3:
            self.scratchpad[SP_CRC] = crc8(self.scratchpad, 8)
            self._state = 'IDLE'

    def _on_write_bit(self, bit: int) -> None:
        if self._state == 'MATCH':
            if bit != self._rom_bit(self._match_idx):
                self._match_ok = False
            self._match_idx += 1
            if self._match_idx == 64:
                self._state = 'FUNC_CMD' if self._match_ok else 'IDLE'
            return
        self._rx_byte |= bit << self._rx_bits
        self._rx_bits += 1
        if self._rx_bits < 8:
            return
        byte = self._rx_byte
        self._rx_byte = 0
        self._rx_bits = 0
        if self._state == 'ROM_CMD':
            self._on_rom_command(byte)
        elif self._state == 'FUNC_CMD':
            self._on_function_command(byte)
        elif self._state == 'WRITE_SP':
            self._on_scratchpad_byte(byte)

    def _on_fall(self, now_ns: int) -> None:
        if self._state == 'SEND':
            if ((self._tx_buf[self._tx_bit >> 3] >> (self._tx_bit & 7)) & 1) == 0:
                self._answer_read0(now_ns)
            self._tx_bit += 1
        elif self._state == 'SEARCH':
            if self._search_phase == 0:
                if self._rom_bit(self._search_idx) == 0:
                    self._answer_read0(now_ns)
                self._search_phase = 1
            elif self._search_phase == 1:
                if self._rom_bit(self._search_idx) == 1:
                    self._answer_read0(now_ns)
                self._search_phase = 2
                self._dir_fall_seen = False
            elif self._search_phase == 2:
                self._dir_fall_seen = True
        elif self._state == 'BUSY_POLL':
            if now_ns < self._busy_until:
                self._answer_read0(now_ns)
        # Write-slot states decode on the rising edge (duration-based).

    def _on_rise(self, now_ns: int, low_dur_ns: int) -> None:
        if low_dur_ns >= RESET_MIN_NS:
            self._drive(True, now_ns + PRESENCE_START_NS)
            self._drive(False, now_ns + PRESENCE_START_NS + PRESENCE_LEN_NS)
            self._gate_until = now_ns + PRESENCE_START_NS + PRESENCE_LEN_NS + PRESENCE_SLACK_NS
            self._state = 'ROM_CMD'
            self._rx_byte = 0
            self._rx_bits = 0
            return
        bit = 1 if low_dur_ns < self._write_sample_ns else 0
        s = self._state
        if s in ('ROM_CMD', 'FUNC_CMD', 'MATCH', 'WRITE_SP'):
            self._on_write_bit(bit)
        elif s == 'SEND':
            # The slot's rise (the master's or our own release) closes the bit.
            if self._tx_bit == len(self._tx_buf) * 8:
                self._state = self._after_send
        elif s == 'SEARCH' and self._search_phase == 2 and self._dir_fall_seen:
            self._dir_fall_seen = False
            if bit != self._rom_bit(self._search_idx):
                self._state = 'IDLE'  # master steered toward another device
                return
            self._search_idx += 1
            self._search_phase = 0
            if self._search_idx == 64:
                self._state = 'IDLE'  # next transaction starts with a reset
        # IDLE rising edges are read-slot inits polling an undriven bus -- nothing to decode.
