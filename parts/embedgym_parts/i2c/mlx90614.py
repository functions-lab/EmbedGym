"""MLX90614 infrared thermometer (MLX90614ESF-BAA on a GY-906 breakout)."""
from __future__ import annotations

import math

from embedgym_parts.i2c.js_math import js_round
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE


MLX90614_ADDR = 0x5A
MS_NS = 1_000_000
# Datasheet Tvalid: the first measurement completes 250 ms after POR; earlier
# reads return it.
FIRST_RESULT_NS = 250 * MS_NS
# Refresh period of a single-zone part at the BAA factory filters (FIR 1024,
# IIR 100%, Table 11); a driven temperature appears at the next refresh.
REFRESH_NS = 93 * MS_NS
EEPROM_WRITE_NS = 5 * MS_NS   # TERASE

RAM_TA = 0x06
RAM_TOBJ1 = 0x07
EEPROM_PWMCTRL = 0x02
EEPROM_CONFIG1 = 0x05
CMD_EEPROM = 0x20
CMD_READ_FLAGS = 0xF0
CMD_SLEEP = 0xFF
PWM_ENABLE = 0x0002
FLAG_EEBUSY = 0x0080
FLAG_INIT = 0x0010
# Config Register1 bits that hold factory calibration (Ks, Kt2, gain, selftest
# repeat) and bit 6, single (0) or dual IR sensor.
CONFIG1_LOCKED = 0x7888 | 0x0040
# Factory EEPROM cells the datasheet documents, at the BAA's typical values:
# To range -20..120 °C, Ta range -20..120 °C, PWM disabled, emissivity 1.0,
# single IR sensor, FIR 1024, IIR 100%, SMBus address 0x5A.
FACTORY_EEPROM = {
    0x00: 0x9993, 0x01: 0x62E3, 0x02: 0x0201, 0x03: 0xF71C, 0x04: 0xFFFF, 0x05: 0x9FB4,
    0x0E: 0xBE5A, 0x1C: 0x1A2B, 0x1D: 0x3C4D, 0x1E: 0x5E6F, 0x1F: 0x7081,
}
WRITABLE_EEPROM = (0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x0E)
OBJECT_RANGE_C = (-70.0, 380.0)
AMBIENT_RANGE_C = (-40.0, 125.0)
# Ta linearization output limits (RAM 0x06): -38.2 °C .. 125 °C.
TA_RAW_MIN = 0x2DE4


def pec(data: list[int]) -> int:
    """SMBus PEC: CRC-8, polynomial x^8 + x^2 + x + 1, initial value 0."""
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def kelvin_word(celsius: float) -> int:
    """RAM temperature word: 0.02 K per LSB, bit 15 the error flag (clear).
    Whole degrees fall halfway between steps (273.15 K = 13657.5 LSB) and round up."""
    return js_round(celsius * 50 + 13657.5)


class MLX90614Slave:
    """SMBus Read Word and Write Word with PEC, at address 0x5A.

    Read Word: cmd, (repeated) START, LSB, MSB, PEC over SA+W, cmd, SA+R, LSB,
    MSB. A repeated START reaches the model as FINISH + START_RECV, as a STOP
    does. Write Word: cmd, LSB, MSB, PEC, STOP; a wrong PEC is NACKed and not
    written. EEPROM cells take erase (0x0000) then value, each busy for 5 ms;
    EEPROM changes apply at the next power-up, which a run never reaches.
    """

    def __init__(self, now_ns) -> None:
        self.addr = MLX90614_ADDR
        self.now_ns = now_ns
        self.eeprom = dict(FACTORY_EEPROM)
        self.power_on_ns = 0
        # (drive time, objectTemperature, ambientTemperature), oldest first.
        self.inputs: list[tuple[int, float, float]] = [(0, 25.0, 25.0)]
        self.eeprom_busy_until_ns = 0
        self.written: list[int] = []
        self.command: int | None = None
        self.reply: list[int] = []
        self.pending_write: tuple[int, int] | None = None

    def power_on(self) -> None:
        self.power_on_ns = self.now_ns()

    def update(self, values: dict, at_ns: int) -> None:
        """`set <role>.objectTemperature|ambientTemperature` in °C, from `at_ns`."""
        _, obj, amb = self.inputs[-1]
        for key, value in values.items():
            if key == 'objectTemperature':
                obj = self._checked(key, value, OBJECT_RANGE_C)
            elif key == 'ambientTemperature':
                amb = self._checked(key, value, AMBIENT_RANGE_C)
            else:
                raise ValueError(f'mlx90614: no property {key!r}')
        self.inputs.append((at_ns, obj, amb))

    @staticmethod
    def _checked(key: str, value, limits: tuple[float, float]) -> float:
        low, high = limits
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'mlx90614: {key} must be a number within {low:g}..{high:g} °C, got {value!r}')
        return float(value)

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op = event & 0xFF
        data = (event >> 8) & 0xFF
        if op == I2C_START_SEND:
            self.written = []
            self.command = None
            return 0
        elif op == I2C_START_RECV:
            if self.command is None:
                raise ValueError('mlx90614: a read must follow a command byte (only SMBus Read Word is supported)')
            self.reply = self._read_word(self.command)
            self.command = None
            return 0
        elif op == I2C_WRITE:
            return self._write_byte(data)
        elif op == I2C_READ:
            # Past the PEC the part releases SDA, which reads HIGH.
            return self.reply.pop(0) if self.reply else 0xFF
        elif op in (I2C_FINISH, I2C_NACK):
            if op == I2C_FINISH:
                self._finish_write()
            return 0
        else:
            raise ValueError(f'mlx90614: unsupported I2C event 0x{op:02x}')

    def _write_byte(self, byte: int) -> int:
        self.written.append(byte)
        if len(self.written) == 1:
            if byte == CMD_SLEEP:
                raise ValueError('mlx90614: sleep mode (command 0xFF) is not supported')
            if byte >= 0x40 and byte != CMD_READ_FLAGS:
                raise ValueError(f'mlx90614: command 0x{byte:02x} is not supported '
                                 '(RAM 0x00-0x1F, EEPROM 0x20-0x3F, read flags 0xF0)')
            self.command = byte
            return 0
        command = self.written[0]
        self.command = None
        if command < CMD_EEPROM:
            raise ValueError(f'mlx90614: RAM is read-only (write to command 0x{command:02x})')
        if command == CMD_READ_FLAGS:
            raise ValueError('mlx90614: the flags (command 0xF0) are read-only')
        if len(self.written) < 4:
            return 0
        if len(self.written) > 4:
            raise ValueError('mlx90614: a Write Word is the command, two data bytes and the PEC')
        word = self.written[1] | (self.written[2] << 8)
        if byte != pec([self.addr << 1, *self.written[:3]]):
            # The part NACKs a wrong PEC and discards the write.
            self.written = []
            return 1
        self._check_eeprom_write(command & 0x1F, word)
        self.pending_write = (command & 0x1F, word)
        return 0

    def _check_eeprom_write(self, cell: int, word: int) -> None:
        if self.now_ns() < self.eeprom_busy_until_ns:
            raise ValueError(f'mlx90614: EEPROM write to 0x{cell:02x} while the previous write is still busy (5 ms)')
        if cell not in WRITABLE_EEPROM:
            raise ValueError(f'mlx90614: EEPROM cell 0x{cell:02x} is not customer-writable')
        if word != 0 and self.eeprom[cell] != 0:
            raise ValueError(f'mlx90614: EEPROM cell 0x{cell:02x} must be erased (written 0x0000) before 0x{word:04x}')
        if cell == EEPROM_PWMCTRL and word & PWM_ENABLE:
            raise ValueError('mlx90614: enabling PWM mode (PWMCTRL bit 1) is not supported')
        if cell == EEPROM_CONFIG1 and word != 0 and (word ^ FACTORY_EEPROM[EEPROM_CONFIG1]) & CONFIG1_LOCKED:
            raise ValueError(f'mlx90614: Config Register1 0x{word:04x} alters factory-calibration bits '
                             f'or the sensor count (mask 0x{CONFIG1_LOCKED:04x})')

    def _finish_write(self) -> None:
        if self.pending_write is not None:
            cell, word = self.pending_write
            self.eeprom[cell] = word
            self.eeprom_busy_until_ns = self.now_ns() + EEPROM_WRITE_NS
        elif len(self.written) > 1:
            raise ValueError('mlx90614: a Write Word ended before its PEC byte')
        self.pending_write = None
        self.written = []

    def _read_word(self, command: int) -> list[int]:
        if command == CMD_READ_FLAGS:
            word = FLAG_INIT | (FLAG_EEBUSY if self.now_ns() < self.eeprom_busy_until_ns else 0)
        elif command >= CMD_EEPROM:
            cell = command & 0x1F
            if self.now_ns() < self.eeprom_busy_until_ns:
                raise ValueError(f'mlx90614: EEPROM read of 0x{cell:02x} while a write is still busy (5 ms)')
            if cell not in self.eeprom:
                raise ValueError(f'mlx90614: EEPROM cell 0x{cell:02x} is Melexis-reserved calibration data, not modeled')
            word = self.eeprom[cell]
        elif command in (RAM_TA, RAM_TOBJ1):
            word = self._temperature_word(command)
        elif command == 0x08:
            raise ValueError('mlx90614: RAM 0x08 (TOBJ2) has no second IR sensor on the single-zone MLX90614BAA')
        elif command in (0x04, 0x05):
            raise ValueError(f'mlx90614: RAM 0x{command:02x} raw IR data is not modeled')
        else:
            raise ValueError(f'mlx90614: RAM 0x{command:02x} is Melexis-reserved')
        lsb, msb = word & 0xFF, word >> 8
        return [lsb, msb, pec([self.addr << 1, command, (self.addr << 1) | 1, lsb, msb])]

    def _temperature_word(self, command: int) -> int:
        first = self.power_on_ns + FIRST_RESULT_NS
        refreshed = first + max(0, self.now_ns() - first) // REFRESH_NS * REFRESH_NS
        latest = max(index for index, entry in enumerate(self.inputs) if entry[0] <= refreshed)
        del self.inputs[:latest]
        _, obj, amb = self.inputs[0]
        if command == RAM_TA:
            return max(TA_RAW_MIN, kelvin_word(amb))
        return kelvin_word(obj)
