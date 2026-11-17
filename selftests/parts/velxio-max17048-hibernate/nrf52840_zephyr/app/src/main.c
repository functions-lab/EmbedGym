// MAX17048 forced-hibernate selftest for nrf52840_zephyr (port of the AVR
// sketch): raw I2C on i2c0. Times count from reset.
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x36

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));

static uint16_t failures = 0;
static uint16_t section_start = 0;

static void wait_until(int64_t at) { while (k_uptime_get() < at) k_msleep(1); }

static void check(bool ok, const char *name)
{
    if (!ok) {
        failures++;
        printk("FAIL %s\n", name);
    }
}

static void finish(const char *name)
{
    printk("%s %u\n", name, failures - section_start);
    section_start = failures;
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    check(i2c_write_read(i2c, ADDR, &reg, 1, data, 2) == 0, "read");
    return ((uint16_t)data[0] << 8) | data[1];
}

static void write_word(uint8_t reg, uint16_t value)
{
    uint8_t buf[3] = {reg, value >> 8, value & 255};
    check(i2c_write(i2c, buf, 3, ADDR) == 0, "write");
}

static bool hibernating(void) { return (read_word(0x06) & 0x1000) != 0; }
static bool voltage(float expected) { return fabsf(read_word(0x02) * 0.000078125f - expected) < 0.002f; }

int main(void)
{
    wait_until(1000);
    check(!hibernating(), "active-at-start");
    check(read_word(0x04) == 50 * 256 && voltage(3.8f), "entry-values");
    write_word(0x0a, 0xffff);
    check(hibernating(), "forced-entry");
    wait_until(45000);
    check(read_word(0x04) == 50 * 256 && voltage(3.8f), "forced-45-second-hold");
    finish("forced-hold");
    wait_until(47000);
    check(hibernating(), "forced-ignores-activity");
    check(read_word(0x04) == 70 * 256 && voltage(4.0f), "forced-45-second-update");
    write_word(0x0a, 0);
    check(!hibernating(), "forced-wake");
    finish("forced-update");
    printk("failures %u\n", failures);
    return 0;
}
