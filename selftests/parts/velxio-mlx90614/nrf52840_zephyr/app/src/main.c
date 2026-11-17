// MLX90614 selftest firmware for nrf52840_zephyr: raw SMBus transfers on i2c0.
#include <stdbool.h>

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x5a

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static unsigned failures;
static unsigned section_start;

static void check(bool ok, const char *name)
{
    if (!ok) {
        failures++;
        printk("FAIL %s\n", name);
    }
}

static void finish_section(const char *name)
{
    printk("%s %u\n", name, failures - section_start);
    section_start = failures;
}

static uint8_t crc8(const uint8_t *data, int length)
{
    uint8_t crc = 0;

    for (int i = 0; i < length; i++) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; bit++) {
            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
        }
    }
    return crc;
}

// SMBus Read Word with a repeated START; checks the PEC.
static uint16_t read_word(uint8_t command)
{
    uint8_t reply[3] = {0};

    check(i2c_write_read(i2c, ADDR, &command, 1, reply, 3) == 0, "read-word");
    uint8_t frame[5] = {ADDR << 1, command, (ADDR << 1) | 1, reply[0], reply[1]};
    check(reply[2] == crc8(frame, 5), "read-pec");
    return reply[0] | (reply[1] << 8);
}

static int write_word(uint8_t command, uint16_t value, bool good_pec)
{
    uint8_t frame[4] = {ADDR << 1, command, value & 0xff, value >> 8};
    uint8_t pec = crc8(frame, 4);
    uint8_t out[4] = {command, frame[2], frame[3], good_pec ? pec : (uint8_t)(pec ^ 0xff)};

    return i2c_write(i2c, out, sizeof(out), ADDR);
}

int main(void)
{
    k_msleep(300);

    check(i2c_write(i2c, NULL, 0, ADDR) == 0, "address-probe");
    finish_section("probe");

    check(read_word(0x07) == 15095, "tobj1-28.75");
    check(read_word(0x06) == 14732, "ta-21.49");
    finish_section("ram");

    check(read_word(0x24) == 0xffff, "emissivity-factory");
    check((read_word(0x2e) & 0xff) == ADDR, "smbus-address-cell");
    check((read_word(0x22) & 0x0002) == 0, "pwm-disabled");
    check((read_word(0x25) & 0x0040) == 0, "single-ir-sensor");
    check(read_word(0xf0) == 0x0010, "flags-idle");
    finish_section("eeprom");

    check(write_word(0x24, 0x0000, true) == 0, "erase-ack");
    check(read_word(0xf0) == 0x0090, "eebusy-after-erase");
    k_msleep(10);
    check(read_word(0xf0) == 0x0010, "eebusy-clears");
    check(read_word(0x24) == 0x0000, "erased");
    check(write_word(0x24, 0xf332, true) == 0, "write-ack");
    k_msleep(10);
    check(read_word(0x24) == 0xf332, "written");
    check(read_word(0x07) == 15095, "emissivity-waits-for-power-up");
    write_word(0x24, 0x0000, true);
    k_msleep(10);
    write_word(0x24, 0xffff, true);
    k_msleep(10);
    check(read_word(0x24) == 0xffff, "restored");
    finish_section("eeprom-write");

    check(write_word(0x24, 0x0000, false) == -EIO, "bad-pec-nacked");
    k_msleep(10);
    check(read_word(0x24) == 0xffff, "bad-pec-discarded");
    finish_section("bad-pec");

    printk("failures %u\n", failures);

    for (;;) {
        uint16_t object = read_word(0x07);
        uint16_t ambient = read_word(0x06);

        printk("raw %u %u\n", object, ambient);
        k_msleep(500);
    }
    return 0;
}
