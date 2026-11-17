"""Host-side transactions over the picsimlab I2C event encoding, shared by the
embedgym_parts/i2c/ part tests."""
from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE

MS_NS = 1_000_000


def write_event(byte: int) -> int:
    return ((byte & 0xFF) << 8) | I2C_WRITE


def write_regs(dev, reg: int, *data: int) -> None:
    """Master write: pointer byte then data bytes, then STOP."""
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(reg)) == 0
    for b in data:
        assert dev.handle_event(write_event(b)) == 0
    dev.handle_event(I2C_FINISH)


def i2c_write_seq(slave, reg: int, data: list[int]) -> None:
    """write_regs without the ACK checks."""
    slave.handle_event(I2C_START_SEND)
    slave.handle_event(write_event(reg))
    for b in data:
        slave.handle_event(write_event(b))
    slave.handle_event(I2C_FINISH)


def read_regs(dev, reg: int, count: int) -> list[int]:
    """Pointer write, repeated START (FINISH + START_RECV), `count` byte reads, STOP."""
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(reg)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    out = [dev.handle_event(I2C_READ) for _ in range(count)]
    dev.handle_event(I2C_FINISH)
    return out


def i2c_read_seq(slave, reg: int, n: int) -> list[int]:
    """read_regs without the ACK checks, as Adafruit BusIO's write_then_read
    drives it: beginTransmission → write(reg) → endTransmission(false) →
    requestFrom → read()*n."""
    slave.handle_event(I2C_START_SEND)
    slave.handle_event(write_event(reg))
    slave.handle_event(I2C_FINISH)
    slave.handle_event(I2C_START_RECV)
    data = [slave.handle_event(I2C_READ) for _ in range(n)]
    slave.handle_event(I2C_FINISH)
    return data


def read_u16_le(regs: bytearray, addr: int) -> int:
    return regs[addr] | (regs[addr + 1] << 8)


def int8(v: int) -> int:
    return v - 0x100 if v > 0x7F else v


def bcd_valid(value: int) -> bool:
    """Both nibbles of a BCD byte are in 0-9."""
    return (value >> 4) <= 9 and (value & 0xF) <= 9


class VirtualClock:
    """Stand-in for the QEMU virtual clock the worker injects."""

    def __init__(self) -> None:
        self.seconds = 0.0

    def __call__(self) -> float:
        return self.seconds


def bcd(n: int) -> int:
    return ((n // 10) << 4) | (n % 10)


def write_time(dev, sec: int, minute: int, hour: int, dow: int,
               date: int, month: int, year2: int) -> None:
    """The 8-byte adjust() write: pointer 0x00 then seconds..year in BCD, STOP."""
    assert dev.handle_event(I2C_START_SEND) == 0
    for byte in (0x00, bcd(sec), bcd(minute), bcd(hour), bcd(dow), bcd(date), bcd(month), bcd(year2)):
        assert dev.handle_event(write_event(byte)) == 0
    dev.handle_event(I2C_FINISH)


def read_time(dev) -> tuple[int, ...]:
    """Pointer write + repeated START + 7-byte burst, decoded from BCD."""
    regs = read_regs(dev, 0x00, 7)
    return tuple((b >> 4) * 10 + (b & 0x0F) for b in regs)
