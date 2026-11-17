"""MAX32664 biometric sensor hub (MAX30101 optical AFE behind it)."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import i32, js_round


MAX32664_ADDR = 0x55
MAX32664_REG_COUNT = 36          # MAX30101 register file; DUMP_REGISTERS serves all of it
MAX32664_CONFIGURATION_REGISTER = 0x0A
MAX32664_MAXFAST_ARRAY_SIZE = 6
MAX32664_MAXFAST_EXTENDED_DATA = 5
MAX32664_LED_ARRAY_SIZE = 12
# LED1 (IR), LED2 (red), LED3, LED4 counts, fixed: the IR / red counts of the
# user guide's annotated FIFO trace; the MAX30101 drives no LED3 / LED4 here.
MAX32664_LED_COUNTS = (223811, 197778, 0, 0)

MAX32664_STATUS_SUCCESS = 0x00
MAX32664_ERR_UNAVAIL_CMD = 0x01
MAX32664_ERR_TRY_AGAIN = 0xFE
MAX32664_DATA_RDY_INT = 0x08

MAX32664_APP_MODE = 0x00
MAX32664_BOOTLOADER_MODE = 0x08
# Families the bootloader answers; every other family is the application's.
MAX32664_BOOTLOADER_FAMILIES = (0x01, 0x02, 0x80, 0x81, 0xFF)

MAX32664_PAUSE = 0x00
MAX32664_SENSOR_DATA = 0x01
MAX32664_ALGO_DATA = 0x02
MAX32664_SENSOR_AND_ALGORITHM = 0x03
MAX32664_PAUSE_TWO = 0x04

MAX32664_DEFAULT_READING = {
    'heartRate': 72, 'confidence': 95, 'oxygen': 98, 'status': 3, 'rValue': 12.5, 'extStatus': 0,
}
MAX32664_RANGES = {
    'heartRate': (0, 511), 'confidence': (0, 100), 'oxygen': (0, 100),
    'status': (0, 3), 'rValue': (0, 6553), 'extStatus': (-128, 127),
}


def _encode16(value: float) -> list[int]:
    """Big-endian 16-bit word, JS `Math.max(0, Math.round(v)) & 0xffff`."""
    v = max(0, js_round(value)) & 0xFFFF
    return [(v >> 8) & 0xFF, v & 0xFF]


class MAX32664Slave:
    """MAX32664 sensor-hub I2C slave (address 0x55), a port of VirtualMAX32664 in
    parts/sim/Max32664.ts — the SparkFun Bio Sensor
    Hub command protocol its spec comment lists.

    Not a register file: every command is one write transaction of
    [family, index, ...args] and its reply — status byte first — is served on
    the next read transaction, so the command executes at the write's STOP
    (a repeated START reaches us as FINISH + START_RECV) and the reply is
    buffered until read. The hub answers from state with no conversion time,
    so no clock is needed. Heart rate and SpO2 travel scaled by 10; the
    readings live here in engineering units, set by `update()`.

    The hub starts in application mode. A reset (RST low, then high) restarts
    the hub firmware: MFIO low at the release selects the bootloader, and every
    hub setting returns to its power-on default. The worker reports those GPIO
    edges through `set_reset_pin`. In bootloader mode the application families
    answer ERR_UNAVAIL_CMD.

    The output FIFO holds one sample while the MAX30101 is enabled and, for
    the formats carrying algorithm data, WHRM runs in mode 1 or 2; otherwise
    NUM_SAMPLES reads 0 and READ_DATA answers ERR_TRY_AGAIN. A sample is the
    four MAX30101 LED words (fixed counts, MAX32664_LED_COUNTS) and/or the
    algorithm block, as the output format selects. The sample-counter formats,
    the accelerometer, the bootloader families and blood-pressure trending are
    not modeled; those and every malformed command raise ValueError (NACK +
    error frame), as the AVR part throws. Clocking out more bytes than a reply
    holds reads 0xFF.
    """

    def __init__(self) -> None:
        self.addr = MAX32664_ADDR
        self.reading = dict(MAX32664_DEFAULT_READING)
        self.write_buf: list[int] = []
        self.read_buf: list[int] = []
        self.phase = 'idle'   # 'idle' | 'write' | 'read'

        self.device_mode = MAX32664_APP_MODE
        self.reset_asserted = False
        self._restore_hub_settings()

        self.max30101_registers = bytearray(MAX32664_REG_COUNT)
        self.max30101_registers[MAX32664_CONFIGURATION_REGISTER] = 0x27  # 411 µs, 100 sps, 4096 nA

    def _restore_hub_settings(self) -> None:
        self.output_mode = MAX32664_ALGO_DATA
        self.fifo_threshold = 0x01
        self.sensor_enabled = False
        self.agc_enabled = False
        self.algorithm_mode = 0        # 0 off, 1 MODE_ONE, 2 MODE_TWO

        self.algo_range = 0x0C
        self.algo_step_size = 0x14
        self.algo_sensitivity = 0x14
        self.algo_samples = 0x01
        self.maxim_fast_coef = [159584, -3465966, 11268987]

    def update(self, **values) -> None:
        """`set <role>.<prop>` — the next FIFO read encodes the new reading.
        Every value is checked before any is applied."""
        for key, value in values.items():
            if key in ('irLed', 'redLed'):
                raise ValueError(f'max32664: {key} is a fixed LED count and cannot be set')
            if key not in MAX32664_RANGES:
                raise ValueError(f'max32664: unknown property "{key}"')
            lo, hi = MAX32664_RANGES[key]
            if (not isinstance(value, (int, float)) or isinstance(value, bool)
                    or not math.isfinite(value) or value < lo or value > hi):
                raise ValueError(f'max32664: {key} must be in {lo}..{hi}, got {value}')
        self.reading.update(values)

    def set_reset_pin(self, high: bool, mfio_high: bool) -> None:
        """RST edge from the host. Only a low→high release after an assert
        counts; MFIO low at that release selects the bootloader instead."""
        if not high:
            self.reset_asserted = True
            return
        if not self.reset_asserted:
            return
        self.reset_asserted = False
        self.device_mode = MAX32664_APP_MODE if mfio_high else MAX32664_BOOTLOADER_MODE
        self._restore_hub_settings()

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_SEND, I2C_START_RECV) and self.phase == 'write':
            # A repeated START ends the write as a STOP does, as QEMU's core
            # reports it on the ESP32 (FINISH, then START).
            self._end_write()
        if op == I2C_START_SEND:
            self.write_buf = []
            self.phase = 'write'
            return 0
        elif op == I2C_START_RECV:
            self.phase = 'read'
            return 0
        elif op == I2C_WRITE:
            self.write_buf.append(data)
            return 0
        elif op == I2C_READ:
            # Past the end of a reply SDA floats high — never a fabricated byte.
            if not self.read_buf:
                return 0xFF
            return self.read_buf.pop(0)
        elif op in (I2C_FINISH, I2C_NACK):
            if self.phase == 'write':
                self._end_write()
            self.phase = 'idle'
            return 0
        else:
            raise ValueError(f'max32664: unsupported I2C event 0x{op:02x}')

    def _end_write(self) -> None:
        self.phase = 'idle'
        # A zero-length write is an address probe and carries no command.
        if self.write_buf:
            command = self.write_buf
            self.write_buf = []
            self.read_buf = self._execute(command)

    # ── Command dispatch ──────────────────────────────────────────────────────

    def _execute(self, data: list[int]) -> list[int]:
        """Full reply for the next read transaction, status byte first."""
        if len(data) == 1:
            raise ValueError(f'max32664: truncated command, got a single byte 0x{data[0]:02x}')
        family, index, args = data[0], data[1], data[2:]
        handlers = {
            0x00: self._hub_status,
            0x01: self._set_device_mode,
            0x02: self._read_device_mode,
            0x10: self._set_output_mode,
            0x11: self._read_output_mode,
            0x12: self._read_data_output,
            0x40: self._write_register,
            0x41: self._read_register,
            0x42: self._read_afe_attributes,
            0x43: self._dump_max30101_registers,
            0x44: self._enable_sensor,
            0x45: self._read_sensor_mode,
            0x50: self._change_algorithm_config,
            0x51: self._read_algorithm_config,
            0x52: self._enable_algorithm,
            0xFF: self._identity,
        }
        if self.device_mode == MAX32664_BOOTLOADER_MODE and family not in MAX32664_BOOTLOADER_FAMILIES:
            return [MAX32664_ERR_UNAVAIL_CMD]
        if family in (0x80, 0x81):
            raise ValueError(f'max32664: bootloader family 0x{family:02x} is not supported — '
                             'flashing needs a real .msbl firmware image')
        if family not in handlers:
            raise ValueError(f'max32664: unsupported family byte 0x{family:02x}')
        return handlers[family](index, args)

    def _hub_status(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x00, index, args, 0)
        if index != 0x00:
            raise ValueError(f'max32664: HUB_STATUS index 0x{index:02x} is not supported')
        # Bit 0 is the communication-error flag the library aborts readBpm() on;
        # DataRdyInt is set while the FIFO holds at least the threshold.
        ready = self._sample_waiting() and self.fifo_threshold <= 1
        return [MAX32664_STATUS_SUCCESS, MAX32664_DATA_RDY_INT if ready else 0x00]

    def _set_device_mode(self, index: int, args: list[int]) -> list[int]:
        if index != 0x00:
            raise ValueError(f'max32664: SET_DEVICE_MODE index 0x{index:02x} is not supported')
        (mode,) = self._expect_args(0x01, index, args, 1)
        if mode == 0x00:                  # EXIT_BOOTLOADER
            if self.device_mode == MAX32664_BOOTLOADER_MODE:
                self.device_mode = MAX32664_APP_MODE
                self._restore_hub_settings()
        elif mode == 0x02:                # DEVICE_RESET
            self.device_mode = MAX32664_APP_MODE
            self._restore_hub_settings()
        elif mode == 0x08:                # ENTER_BOOTLOADER
            self.device_mode = MAX32664_BOOTLOADER_MODE
            self._restore_hub_settings()
        else:
            raise ValueError(f'max32664: unsupported device mode 0x{mode:02x}')
        return [MAX32664_STATUS_SUCCESS]

    def _read_device_mode(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x02, index, args, 0)
        if index != 0x00:
            raise ValueError(f'max32664: READ_DEVICE_MODE index 0x{index:02x} is not supported')
        return [MAX32664_STATUS_SUCCESS, self.device_mode]

    def _set_output_mode(self, index: int, args: list[int]) -> list[int]:
        if index == 0x00:                 # SET_FORMAT
            (fmt,) = self._expect_args(0x10, index, args, 1)
            if fmt in (0x05, 0x06, 0x07):
                raise ValueError(f'max32664: sample-counter output format 0x{fmt:02x} is not supported')
            if fmt > MAX32664_PAUSE_TWO:
                raise ValueError(f'max32664: output format 0x{fmt:02x} is out of range')
            self.output_mode = fmt
            return [MAX32664_STATUS_SUCCESS]
        if index == 0x01:                 # WRITE_SET_THRESHOLD
            (threshold,) = self._expect_args(0x10, index, args, 1)
            if threshold == 0:
                raise ValueError('max32664: FIFO threshold must be 1..255, got 0')
            self.fifo_threshold = threshold
            return [MAX32664_STATUS_SUCCESS]
        raise ValueError(f'max32664: OUTPUT_MODE index 0x{index:02x} is not supported')

    def _read_output_mode(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x11, index, args, 0)
        if index != 0x00:
            raise ValueError(f'max32664: READ_OUTPUT_MODE index 0x{index:02x} is not supported')
        return [MAX32664_STATUS_SUCCESS, self.output_mode]

    def _read_data_output(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x12, index, args, 0)
        if index == 0x00:                 # NUM_SAMPLES
            return [MAX32664_STATUS_SUCCESS, 0x01 if self._sample_waiting() else 0x00]
        if index == 0x01:                 # READ_DATA
            if not self._sample_waiting():
                return [MAX32664_ERR_TRY_AGAIN]
            return [MAX32664_STATUS_SUCCESS, *self._encode_sample()]
        raise ValueError(f'max32664: READ_DATA_OUTPUT index 0x{index:02x} is not supported')

    def _write_register(self, index: int, args: list[int]) -> list[int]:
        reg, value = self._expect_args(0x40, index, args, 2)
        if index == 0x03:                 # MAX30101
            if reg >= MAX32664_REG_COUNT and reg not in (0xFF, 0xFE):
                raise ValueError(f'max32664: MAX30101 register 0x{reg:02x} is out of range')
            if reg < MAX32664_REG_COUNT:
                self.max30101_registers[reg] = value
            return [MAX32664_STATUS_SUCCESS]
        if index == 0x04:
            raise ValueError('max32664: no accelerometer is fitted on this board')
        raise ValueError(f'max32664: WRITE_REGISTER index 0x{index:02x} is not supported')

    def _read_register(self, index: int, args: list[int]) -> list[int]:
        (reg,) = self._expect_args(0x41, index, args, 1)
        if index == 0x03:
            if reg == 0xFF:
                return [MAX32664_STATUS_SUCCESS, 0x15]       # MAX30101 part ID
            if reg == 0xFE:
                return [MAX32664_STATUS_SUCCESS, 0x01]       # revision ID
            if reg >= MAX32664_REG_COUNT:
                raise ValueError(f'max32664: MAX30101 register 0x{reg:02x} is out of range')
            return [MAX32664_STATUS_SUCCESS, self.max30101_registers[reg]]
        if index == 0x04:
            raise ValueError('max32664: no accelerometer is fitted on this board')
        raise ValueError(f'max32664: READ_REGISTER index 0x{index:02x} is not supported')

    def _read_afe_attributes(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x42, index, args, 0)
        if index == 0x03:
            return [MAX32664_STATUS_SUCCESS, 3, MAX32664_REG_COUNT]   # bytes per word, register count
        if index == 0x04:
            return [MAX32664_STATUS_SUCCESS, 1, 0]
        raise ValueError(f'max32664: READ_ATTRIBUTES_AFE index 0x{index:02x} is not supported')

    def _dump_max30101_registers(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x43, index, args, 0)
        if index == 0x03:
            return [MAX32664_STATUS_SUCCESS, *self.max30101_registers]
        if index == 0x04:
            raise ValueError('max32664: no accelerometer is fitted on this board')
        raise ValueError(f'max32664: DUMP_REGISTERS index 0x{index:02x} is not supported')

    def _enable_sensor(self, index: int, args: list[int]) -> list[int]:
        (enable,) = self._expect_args(0x44, index, args, 1)
        if enable not in (0x00, 0x01):
            raise ValueError(f'max32664: ENABLE_SENSOR takes 0 or 1, got 0x{enable:02x}')
        if index == 0x03:
            self.sensor_enabled = enable == 0x01
            return [MAX32664_STATUS_SUCCESS]
        if index == 0x04:
            if enable == 0x01:
                raise ValueError('max32664: no accelerometer is fitted on this board')
            return [MAX32664_STATUS_SUCCESS]
        raise ValueError(f'max32664: ENABLE_SENSOR index 0x{index:02x} is not supported')

    def _read_sensor_mode(self, index: int, args: list[int]) -> list[int]:
        self._expect_args(0x45, index, args, 0)
        if index == 0x03:
            return [MAX32664_STATUS_SUCCESS, 0x01 if self.sensor_enabled else 0x00]
        if index == 0x04:
            return [MAX32664_STATUS_SUCCESS, 0x00]
        raise ValueError(f'max32664: READ_SENSOR_MODE index 0x{index:02x} is not supported')

    def _change_algorithm_config(self, index: int, args: list[int]) -> list[int]:
        if index == 0x00:                 # AGC config
            cfg_id, value = self._expect_args(0x50, index, args, 2)
            if cfg_id == 0x00:
                self.algo_range = value
            elif cfg_id == 0x01:
                self.algo_step_size = value
            elif cfg_id == 0x02:
                self.algo_sensitivity = value
            elif cfg_id == 0x03:
                self.algo_samples = value
            else:
                raise ValueError(f'max32664: AGC config id 0x{cfg_id:02x} is not supported')
            return [MAX32664_STATUS_SUCCESS]
        if index == 0x02:                 # SpO2 coefficients
            if not args or args[0] != 0x0B or len(args) != 13:
                raise ValueError('max32664: SpO2 coefficients take id 0x0B and three 32-bit values, '
                                 f'got {len(args)} byte(s)')
            words = args[1:]
            self.maxim_fast_coef = [
                i32((words[o] << 24) | (words[o + 1] << 16) | (words[o + 2] << 8) | words[o + 3])
                for o in (0, 4, 8)
            ]
            return [MAX32664_STATUS_SUCCESS]
        if index == 0x04:
            raise ValueError('max32664: blood-pressure-trending config is not supported — '
                             'it needs a real 824-byte calibration vector')
        raise ValueError(f'max32664: CHANGE_ALGORITHM_CONFIG index 0x{index:02x} is not supported')

    def _read_algorithm_config(self, index: int, args: list[int]) -> list[int]:
        if index == 0x00:
            (cfg_id,) = self._expect_args(0x51, index, args, 1)
            values = {0x00: self.algo_range, 0x01: self.algo_step_size,
                      0x02: self.algo_sensitivity, 0x03: self.algo_samples}
            if cfg_id not in values:
                raise ValueError(f'max32664: AGC read id 0x{cfg_id:02x} is not supported')
            return [MAX32664_STATUS_SUCCESS, values[cfg_id]]
        if index == 0x02:
            (cfg_id,) = self._expect_args(0x51, index, args, 1)
            if cfg_id != 0x0B:
                raise ValueError(f'max32664: SpO2 coefficient read id 0x{cfg_id:02x} is not supported')
            payload = [b for coef in self.maxim_fast_coef
                       for b in ((coef >> 24) & 0xFF, (coef >> 16) & 0xFF, (coef >> 8) & 0xFF, coef & 0xFF)]
            return [MAX32664_STATUS_SUCCESS, *payload]
        if index == 0x04:
            raise ValueError('max32664: blood-pressure-trending config is not supported')
        raise ValueError(f'max32664: READ_ALGORITHM_CONFIG index 0x{index:02x} is not supported')

    def _enable_algorithm(self, index: int, args: list[int]) -> list[int]:
        (enable,) = self._expect_args(0x52, index, args, 1)
        if index == 0x00:                 # AGC
            if enable not in (0x00, 0x01):
                raise ValueError(f'max32664: AGC enable takes 0 or 1, got 0x{enable:02x}')
            self.agc_enabled = enable == 0x01
            return [MAX32664_STATUS_SUCCESS]
        if index == 0x02:                 # WHRM — the byte doubles as the mode and picks the FIFO layout
            if enable > 0x02:
                raise ValueError(f'max32664: WHRM algorithm mode 0x{enable:02x} is not supported')
            self.algorithm_mode = enable
            return [MAX32664_STATUS_SUCCESS]
        raise ValueError(f'max32664: ENABLE_ALGORITHM index 0x{index:02x} is not supported')

    def _identity(self, index: int, args: list[int]) -> list[int]:
        if index == 0x00:                 # READ_MCU_TYPE: 0x01 is the MAX32660/MAX32664
            self._expect_args(0xFF, index, args, 1)
            return [MAX32664_STATUS_SUCCESS, 0x01]
        if index == 0x03:                 # sensor hub version
            self._expect_args(0xFF, index, args, 0)
            return [MAX32664_STATUS_SUCCESS, 10, 1, 0]
        if index == 0x07:                 # algorithm version
            self._expect_args(0xFF, index, args, 0)
            return [MAX32664_STATUS_SUCCESS, 10, 1, 0]
        raise ValueError(f'max32664: IDENTITY index 0x{index:02x} is not supported')

    # ── Output FIFO ───────────────────────────────────────────────────────────

    def _sample_waiting(self) -> bool:
        if not self.sensor_enabled:
            return False
        if self.output_mode in (MAX32664_PAUSE, MAX32664_PAUSE_TWO):
            return False
        if self.output_mode == MAX32664_SENSOR_DATA:
            return True
        if self.output_mode in (MAX32664_ALGO_DATA, MAX32664_SENSOR_AND_ALGORITHM):
            return self.algorithm_mode != 0
        raise ValueError(f'max32664: output format 0x{self.output_mode:02x} is not modeled')

    def _encode_sample(self) -> list[int]:
        if self.output_mode == MAX32664_SENSOR_DATA:
            return self._led_block()
        if self.output_mode == MAX32664_ALGO_DATA:
            return self._algorithm_block()
        if self.output_mode == MAX32664_SENSOR_AND_ALGORITHM:
            return [*self._led_block(), *self._algorithm_block()]
        raise ValueError(f'max32664: output format 0x{self.output_mode:02x} carries no samples')

    def _led_block(self) -> list[int]:
        block = [b for count in MAX32664_LED_COUNTS
                 for b in ((count >> 16) & 0xFF, (count >> 8) & 0xFF, count & 0xFF)]
        return self._sized(block, MAX32664_LED_ARRAY_SIZE)

    def _algorithm_block(self) -> list[int]:
        r = self.reading
        block = [
            *_encode16(r['heartRate'] * 10),
            js_round(r['confidence']) & 0xFF,
            *_encode16(r['oxygen'] * 10),
            js_round(r['status']) & 0xFF,
        ]
        if self.algorithm_mode == 0x01:
            return self._sized(block, MAX32664_MAXFAST_ARRAY_SIZE)
        if self.algorithm_mode == 0x02:
            return self._sized(
                [*block, *_encode16(r['rValue'] * 10), js_round(r['extStatus']) & 0xFF,
                 0x00, 0x00],   # reserveOne / reserveTwo — requested by the library, unused in firmware 10.1
                MAX32664_MAXFAST_ARRAY_SIZE + MAX32664_MAXFAST_EXTENDED_DATA,
            )
        raise ValueError(f'max32664: WHRM mode {self.algorithm_mode} produces no algorithm block')

    @staticmethod
    def _sized(block: list[int], expected: int) -> list[int]:
        if len(block) != expected:
            raise ValueError(f'max32664: sample block should be {expected} bytes, built {len(block)}')
        return block

    @staticmethod
    def _expect_args(family: int, index: int, args: list[int], count: int) -> list[int]:
        if len(args) != count:
            raise ValueError(f'max32664: command 0x{family:02x}/0x{index:02x} takes {count} '
                             f'argument(s), got {len(args)}')
        return args
