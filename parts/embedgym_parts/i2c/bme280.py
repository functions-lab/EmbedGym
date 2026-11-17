"""BME280 environmental sensor (I2C and SPI)."""
from __future__ import annotations

from embedgym_parts.i2c.bmp280 import BMP280Slave
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import cdiv, i32, imul, js_round


BME280_REG_CHIP_ID   = 0xD0
BME280_REG_RESET     = 0xE0
BME280_REG_CTRL_HUM  = 0xF2
BME280_REG_STATUS    = 0xF3
BME280_REG_CTRL_MEAS = 0xF4
BME280_REG_CONFIG    = 0xF5
BME280_REG_PRESS_MSB = 0xF7
BME280_REG_HUM_LSB   = 0xFE

BME280_CHIP_ID    = 0x60
BME280_RESET_WORD = 0xB6
BME280_MODE_SLEEP  = 0b00
BME280_MODE_NORMAL = 0b11

# Data register contents after reset and for a skipped channel (datasheet 4.1).
BME280_SKIPPED_PRESS_TEMP = bytes([0x80, 0x00, 0x00])
BME280_SKIPPED_HUM        = bytes([0x80, 0x00])

BME280_STATUS_MEASURING = 0x08
BME280_STATUS_IM_UPDATE = 0x01
BME280_OVERSAMPLING = (0, 1, 2, 4, 8, 16, 16, 16)
# IIR coefficient per config.filter[2:0] (Table 28); 1 = filter off.
BME280_FILTER_COEFFICIENT = (1, 2, 4, 8, 16, 16, 16, 16)
BME280_STANDBY_NS = (500_000, 62_500_000, 125_000_000, 250_000_000,
                     500_000_000, 1_000_000_000, 10_000_000, 20_000_000)
BME280_STARTUP_NS = 2_000_000
BME280_RANGES = {'temperature_c': (-40, 85), 'pressure_hpa': (300, 1100), 'humidity_pct': (0, 100)}


class BME280Slave(BMP280Slave):
    """BME280 register file (chip_id 0x60) behind the I2C and SPI transports.

    A port of VirtualBME280 (parts/sim/Bme280.ts),
    which extends VirtualBMP280 the way this class extends BMP280Slave: same
    calibration and pressure back-solve, plus the humidity channel, and
    temperature re-solved against the Bosch reference driver's C-truncating
    int32 arithmetic so a stock-formula firmware reads back exactly the value
    that was set. Register semantics (writable set, (register, data) write
    pairs, ctrl_hum latching on ctrl_meas, FORCED -> SLEEP, skip values) match
    the frontend line for line; unsupported writes raise ValueError.

    The IIR filter (3.4.4) runs on the 20-bit temperature and pressure ADC
    values of every completed measurement; humidity is unfiltered. A config
    write, soft reset or power-on resets it, and the next measurement then
    passes through unchanged and initialises its memory. A skipped channel
    keeps its memory. The memory is kept unrounded and the output register
    holds it rounded to the nearest code, so a held input converges exactly.

    Without a clock (`now_ns=None`, as in the ESP32 worker) a measurement
    completes inside the ctrl_meas write and, in normal mode, at each
    supplied-value change; normal mode then stands for continuous measuring,
    so the filter output is settled on the supplied values. With `now_ns`
    (virtual ns) measurements run on
    it: a ctrl_meas write that leaves sleep starts one, status.measuring reads 1
    until it completes the datasheet's typical measurement time later, and only
    then do the data registers take the supplied values; forced mode falls back
    to sleep then, normal mode repeats after the standby time, and
    status.im_update reads 1 for the 2 ms start-up after power-on and soft
    reset. A read transaction sees the registers as they stood at its first
    byte.
    """

    # Typical real-device humidity calibration (the datasheet has no example set).
    DIG_H1 = 75; DIG_H2 = 362; DIG_H3 = 0
    DIG_H4 = 315; DIG_H5 = 50; DIG_H6 = 30

    def __init__(self, addr: int = 0x76, now_ns=None):
        self.now_ns = now_ns
        self._due_ns: int | None = None   # completion of the running measurement
        self._ready_ns = 0                # end of the start-up time
        # Data registers as they stood at the open read transaction's first
        # byte (4.1 shadowing); None between transactions.
        self._shadow: bytes | None = None
        self._humidity_pct = 50.0
        # The base constructor's _update_measurements() reaches our override
        # before the humidity state exists; `_ready` keeps that early call on
        # the base behavior.
        self._ready = False
        # Last measurement, served at 0xF7–0xFE; the base writes live values into regs.
        self.latched = bytearray(8)
        # IIR filter memory for pressure and temperature; None until initialised.
        self.filter_memory: list[float | None] = [None, None]
        # Effective humidity oversampling: ctrl_hum only applies on the next ctrl_meas write (5.4.3).
        self.osrs_h = 0
        self.i2c_expect_address = True
        self.spi_awaiting_control = True
        self.spi_reading = False
        self.spi_reg_ptr = 0
        super().__init__(addr)
        self.regs[BME280_REG_CHIP_ID] = BME280_CHIP_ID
        self._init_humidity_calibration()
        self._ready = True
        self.reset()
        self._update_humidity()

    # ── Supplied values ───────────────────────────────────────────────────────

    @property
    def temperature_c(self) -> float:
        return self._temp_c

    @temperature_c.setter
    def temperature_c(self, v: float) -> None:
        self.sync()
        self._temp_c = v
        self._update_measurements()

    @property
    def pressure_hpa(self) -> float:
        return self._press_hpa

    @pressure_hpa.setter
    def pressure_hpa(self, v: float) -> None:
        self.sync()
        self._press_hpa = v
        self._update_measurements()

    @property
    def humidity_pct(self) -> float:
        return self._humidity_pct

    @humidity_pct.setter
    def humidity_pct(self, v: float) -> None:
        self.sync()
        self._humidity_pct = v
        self._refresh()

    def update(self, temperature_c: float | None = None, pressure_hpa: float | None = None,
               humidity_pct: float | None = None) -> None:
        """The worker's drive: an absent value keeps its current one."""
        given = {k: v for k, v in (('temperature_c', temperature_c), ('pressure_hpa', pressure_hpa),
                                   ('humidity_pct', humidity_pct)) if v is not None}
        for key, value in given.items():
            low, high = BME280_RANGES[key]
            if not low <= value <= high:
                raise ValueError(f'bme280: {key} must be {low}..{high}, got {value}')
        self.sync()
        self._temp_c = given.get('temperature_c', self._temp_c)
        self._press_hpa = given.get('pressure_hpa', self._press_hpa)
        self._humidity_pct = given.get('humidity_pct', self._humidity_pct)
        self._update_measurements()

    def _update_measurements(self) -> None:
        super()._update_measurements()
        if self._ready:
            self._refresh()

    def _refresh(self) -> None:
        """Recompute the humidity ADC (it depends on t_fine) and, clockless in
        NORMAL mode, publish the new values; a clocked part publishes them at
        its next measurement."""
        self._update_humidity()
        if self.now_ns is None and (self.regs[BME280_REG_CTRL_MEAS] & 0x03) == BME280_MODE_NORMAL:
            self._measure()

    def _init_humidity_calibration(self) -> None:
        r = self.regs
        r[0xA1] = self.DIG_H1
        r[0xE1] = self.DIG_H2 & 0xFF
        r[0xE2] = (self.DIG_H2 >> 8) & 0xFF
        r[0xE3] = self.DIG_H3
        # dig_H4 = (0xE4 << 4) | (0xE5 & 0x0F); dig_H5 = (0xE6 << 4) | (0xE5 >> 4)
        r[0xE4] = (self.DIG_H4 >> 4) & 0xFF
        r[0xE5] = ((self.DIG_H5 & 0x0F) << 4) | (self.DIG_H4 & 0x0F)
        r[0xE6] = (self.DIG_H5 >> 4) & 0xFF
        r[0xE7] = self.DIG_H6 & 0xFF

    # ── Compensation (Bosch reference driver int32 arithmetic) ────────────────

    def _t_fine(self, adc_t: int) -> int:
        """t_fine the way the Bosch reference driver (and Adafruit_BME280) computes
        it: C integer division truncating toward zero. The BMP280 base uses the
        datasheet's shift form, which floors — one LSB apart whenever an
        intermediate is negative (below 0 °C). Overriding here also covers
        _find_adc_t and the pressure path, since both go through this method."""
        r = self.regs

        def u16(a: int) -> int:
            return r[a] | (r[a + 1] << 8)

        def s16(a: int) -> int:
            v = u16(a)
            return v - 0x10000 if v & 0x8000 else v

        t1, t2, t3 = u16(0x88), s16(0x8A), s16(0x8C)
        var1 = cdiv(imul(i32(cdiv(adc_t, 8) - t1 * 2), t2), 2048)
        sub = i32(cdiv(adc_t, 16) - t1)
        var2 = cdiv(imul(cdiv(imul(sub, sub), 4096), t3), 16384)
        return i32(var1 + var2)

    def _find_adc_t(self, target_centideg: int) -> int:
        """Same search as the base, against the driver's truncating (t_fine * 5 + 128) / 256."""
        lo, hi = 0, (1 << 20) - 1
        while lo < hi:
            mid = (lo + hi) >> 1
            if cdiv(self._t_fine(mid) * 5 + 128, 256) < target_centideg:
                lo = mid + 1
            else:
                hi = mid
        return lo

    def _compensate_h(self, adc_h: int, tf: int) -> int:
        """Bosch reference-driver int32 humidity compensation (the Adafruit_BME280
        code path). Returns %RH x 1024."""
        var1 = i32(tf - 76800)
        var2 = i32(adc_h * 16384)
        var3 = i32(self.DIG_H4 * 1048576)
        var4 = imul(self.DIG_H5, var1)
        var5 = cdiv(i32(i32(var2 - var3) - var4 + 16384), 32768)
        var2 = cdiv(imul(var1, self.DIG_H6), 1024)
        var3 = cdiv(imul(var1, self.DIG_H3), 2048)
        var4 = i32(cdiv(imul(var2, i32(var3 + 32768)), 1024) + 2097152)
        var2 = cdiv(i32(imul(var4, self.DIG_H2) + 8192), 16384)
        var3 = imul(var5, var2)
        var4 = cdiv(imul(cdiv(var3, 32768), cdiv(var3, 32768)), 128)
        var5 = i32(var3 - cdiv(imul(var4, self.DIG_H1), 16))
        if var5 < 0:
            var5 = 0
        if var5 > 419430400:
            var5 = 419430400
        return cdiv(var5, 4096)

    def _update_humidity(self) -> None:
        """Binary-search the 16-bit raw ADC value for the target humidity."""
        adc_t = self._find_adc_t(js_round(self._temp_c * 100))
        tf = self._t_fine(adc_t)
        target = js_round(self._humidity_pct * 1024)
        lo, hi = 0, 0xFFFF
        while lo < hi:
            mid = (lo + hi) >> 1
            if self._compensate_h(mid, tf) < target:
                lo = mid + 1
            else:
                hi = mid
        self.regs[0xFD] = (lo >> 8) & 0xFF
        self.regs[0xFE] = lo & 0xFF

    # ── Register file semantics shared by both transports ─────────────────────

    def reset(self) -> None:
        self.regs[BME280_REG_CTRL_HUM] = 0
        self.regs[BME280_REG_STATUS] = 0
        self.regs[BME280_REG_CTRL_MEAS] = 0
        self.regs[BME280_REG_CONFIG] = 0
        self.osrs_h = 0
        self.latched[:] = BME280_SKIPPED_PRESS_TEMP + BME280_SKIPPED_PRESS_TEMP + BME280_SKIPPED_HUM
        self.filter_memory = [None, None]
        self._due_ns = None
        if self.now_ns is not None:
            self._ready_ns = self.now_ns() + BME280_STARTUP_NS

    # ── Measurement timing (clocked part only) ────────────────────────────────

    def _measure_ns(self) -> int:
        """Typical measurement time (datasheet 9.1)."""
        ctrl = self.regs[BME280_REG_CTRL_MEAS]
        total = 1_000_000 + 2_000_000 * BME280_OVERSAMPLING[ctrl >> 5]
        for osrs in (BME280_OVERSAMPLING[(ctrl >> 2) & 0x07], BME280_OVERSAMPLING[self.osrs_h]):
            if osrs:
                total += 2_000_000 * osrs + 500_000
        return total

    def sync(self) -> None:
        """Complete every measurement that has come due on now_ns."""
        if self.now_ns is None:
            return
        now = self.now_ns()
        while self._due_ns is not None and self._due_ns <= now:
            self._measure()
            if (self.regs[BME280_REG_CTRL_MEAS] & 0x03) == BME280_MODE_NORMAL:
                self._due_ns += BME280_STANDBY_NS[self.regs[BME280_REG_CONFIG] >> 5] + self._measure_ns()
            else:
                self.regs[BME280_REG_CTRL_MEAS] &= ~0x03
                self._due_ns = None

    def _status(self) -> int:
        now = self.now_ns()
        measuring = self._due_ns is not None and now >= self._due_ns - self._measure_ns()
        return ((BME280_STATUS_MEASURING if measuring else 0)
                | (BME280_STATUS_IM_UPDATE if now < self._ready_ns else 0))

    def _measure(self) -> None:
        """Latch the live ADC values into the data registers: per-channel skip
        for oversampling 0, the IIR filter on temperature and pressure."""
        ctrl = self.regs[BME280_REG_CTRL_MEAS]
        osrs_t = (ctrl >> 5) & 0x07
        osrs_p = (ctrl >> 2) & 0x07
        live = self.regs[BME280_REG_PRESS_MSB:BME280_REG_HUM_LSB + 1]
        self.latched[0:3] = BME280_SKIPPED_PRESS_TEMP if osrs_p == 0 else self._filter(0, live[0:3])
        self.latched[3:6] = BME280_SKIPPED_PRESS_TEMP if osrs_t == 0 else self._filter(1, live[3:6])
        self.latched[6:8] = BME280_SKIPPED_HUM if self.osrs_h == 0 else live[6:8]

    def _filter(self, channel: int, raw: bytes) -> bytes:
        """One IIR step (3.4.4) on a 20-bit ADC value in register encoding."""
        coefficient = BME280_FILTER_COEFFICIENT[(self.regs[BME280_REG_CONFIG] >> 2) & 0x07]
        if coefficient == 1:
            return raw
        adc = (raw[0] << 12) | (raw[1] << 4) | (raw[2] >> 4)
        memory = self.filter_memory[channel]
        settled = self.now_ns is None and (self.regs[BME280_REG_CTRL_MEAS] & 0x03) == BME280_MODE_NORMAL
        memory = adc if memory is None or settled else (memory * (coefficient - 1) + adc) / coefficient
        self.filter_memory[channel] = memory
        return bytes(self._encode20(js_round(memory)))

    def read_register(self, reg: int) -> int:
        if BME280_REG_PRESS_MSB <= reg <= BME280_REG_HUM_LSB:
            return self.latched[reg - BME280_REG_PRESS_MSB]
        if reg == BME280_REG_STATUS and self.now_ns is not None:
            return self._status()
        return self.regs[reg]

    def _read_transaction_byte(self, reg: int) -> int:
        """The first byte of a read transaction completes the measurements due by
        then; the data registers hold that snapshot until the transaction ends."""
        if self._shadow is None:
            self.sync()
            self._shadow = bytes(self.latched)
        if BME280_REG_PRESS_MSB <= reg <= BME280_REG_HUM_LSB:
            return self._shadow[reg - BME280_REG_PRESS_MSB]
        return self.read_register(reg)

    def write_register(self, reg: int, value: int) -> None:
        self.sync()
        if reg == BME280_REG_RESET:
            if value != BME280_RESET_WORD:
                raise ValueError(f'bme280: reset register accepts only 0xB6, got 0x{value:02x}')
            self.reset()
        elif reg == BME280_REG_CTRL_HUM:
            if value & 0xF8:
                raise ValueError(f'bme280: ctrl_hum reserved bits set (0x{value:02x})')
            self.regs[BME280_REG_CTRL_HUM] = value
        elif reg == BME280_REG_CTRL_MEAS:
            self.osrs_h = self.regs[BME280_REG_CTRL_HUM] & 0x07
            self.regs[BME280_REG_CTRL_MEAS] = value
            mode = value & 0x03
            if self.now_ns is not None:
                self._due_ns = None if mode == BME280_MODE_SLEEP else self.now_ns() + self._measure_ns()
                return
            if mode == BME280_MODE_SLEEP:
                return
            self._measure()
            if mode != BME280_MODE_NORMAL:
                self.regs[BME280_REG_CTRL_MEAS] = value & ~0x03
        elif reg == BME280_REG_CONFIG:
            if value & 0x01:
                raise ValueError('bme280: 3-wire SPI (config.spi3w_en) is not supported')
            self.regs[BME280_REG_CONFIG] = value
            self.filter_memory = [None, None]
        else:
            raise ValueError(f'bme280: write to read-only register 0x{reg:02x}')

    # ── I2C transport (6.2): address byte, then (register, data) pairs ────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND):
            # reg_ptr survives: a write-then-read (repeated START) relies on the
            # pointer set by the preceding write phase.
            self.i2c_expect_address = True
            self._shadow = None
            return 0
        elif op == I2C_WRITE:
            if self.i2c_expect_address:
                self.reg_ptr = data
                self.i2c_expect_address = False
            else:
                self.write_register(self.reg_ptr, data)
                self.i2c_expect_address = True
            return 0
        elif op == I2C_READ:
            val = self._read_transaction_byte(self.reg_ptr)
            self.reg_ptr = (self.reg_ptr + 1) & 0xFF
            return val
        elif op in (I2C_FINISH, I2C_NACK):
            self.i2c_expect_address = True
            self._shadow = None
            return 0
        else:
            raise ValueError(f'bme280: unsupported I2C event 0x{op:02x}')

    # ── SPI transport (6.3): control byte (bit 7 = read), then data ───────────

    def spi_transfer(self, value: int) -> int:
        if self.spi_awaiting_control:
            self.spi_awaiting_control = False
            self.spi_reading = (value & 0x80) != 0
            # Every register lives above 0x7F, so the address is the low 7 bits with bit 7 restored.
            self.spi_reg_ptr = value | 0x80
            return 0x00
        if self.spi_reading:
            val = self._read_transaction_byte(self.spi_reg_ptr)
            self.spi_reg_ptr = (self.spi_reg_ptr + 1) & 0xFF
            return val
        self.write_register(self.spi_reg_ptr, value)
        self.spi_awaiting_control = True
        return 0x00

    def spi_deselect(self) -> None:
        """Called on the CS rising edge; the next transfer starts a new transaction."""
        self.spi_awaiting_control = True
        self._shadow = None
