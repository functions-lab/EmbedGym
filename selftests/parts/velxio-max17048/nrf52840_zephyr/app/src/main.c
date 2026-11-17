// MAX17048 register-level selftest for nrf52840_zephyr (port of the AVR
// sketch): raw I2C on i2c0, INT and QStart on the max17048-int /
// max17048-qstart aliases. The bus-sleep section suspends i2c0 and drives
// SDA/SCL as GPIOs. Times count from reset.
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/pm/device.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x36
#define SDA_PIN 21
#define SCL_PIN 27

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct device *const gpio0 = DEVICE_DT_GET(DT_NODELABEL(gpio0));
static const struct gpio_dt_spec alert = GPIO_DT_SPEC_GET(DT_ALIAS(max17048_int), gpios);
static const struct gpio_dt_spec qstart = GPIO_DT_SPEC_GET(DT_ALIAS(max17048_qstart), gpios);

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

static int write_bytes(uint8_t reg, uint8_t high, uint8_t low, bool both)
{
    uint8_t buf[3] = {reg, high, low};
    return i2c_write(i2c, buf, both ? 3 : 2, ADDR);
}

static void write_word(uint8_t reg, uint16_t value)
{
    check(write_bytes(reg, value >> 8, value & 255, true) == 0, "write");
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    check(i2c_write_read(i2c, ADDR, &reg, 1, data, 2) == 0, "read");
    return ((uint16_t)data[0] << 8) | data[1];
}

static void drive_bus(int level)
{
    gpio_pin_set_raw(gpio0, SDA_PIN, level);
    gpio_pin_set_raw(gpio0, SCL_PIN, level);
}

int main(void)
{
    gpio_pin_configure_dt(&alert, GPIO_INPUT);
    gpio_pin_configure_dt(&qstart, GPIO_OUTPUT_INACTIVE);

    check(read_word(0x08) == 0x12, "version");
    check(read_word(0x0a) == 0x8030, "hib-default");
    check(read_word(0x0c) == 0x971c, "config-default");
    check(read_word(0x18) == 0x9648, "vreset-default-id");
    check(read_word(0x1a) == 0x0100, "status-default");
    check(read_word(0x04) == 0, "startup-not-ready");
    k_msleep(300);
    check(abs((int)read_word(0x02) - 48640) < 20, "voltage-encoding");
    check(read_word(0x04) == 12800, "soc-encoding");
    finish("defaults");

    check(write_bytes(0x0a, 0xff, 0, false) == 0, "byte-ack");
    check(read_word(0x0a) == 0x8030, "byte-ignored");
    write_word(0x0c, 0x8311);
    check(read_word(0x0c) == 0x8311, "rcomp-athd");
    write_word(0x18, 0x8842);
    check(read_word(0x18) == 0x8848, "id-readonly");
    write_word(0x02, 0);
    check(read_word(0x02) != 0, "vcell-readonly");
    write_word(0x0a, 0x0000);
    finish("word-config");

    write_word(0x06, 0x6000);
    check(read_word(0x06) == 0x2000, "quick-selfclear");
    check(read_word(0x04) == 0, "quick-reacquire");
    k_msleep(300);
    check(read_word(0x04) == 12800, "quick-result");
    gpio_pin_set_dt(&qstart, 1);
    k_msleep(2);
    check(read_word(0x04) == 0, "hardware-quick");
    k_msleep(300);
    check(read_word(0x04) == 12800, "hardware-result");
    gpio_pin_set_dt(&qstart, 0);
    finish("quickstart");

    wait_until(1500);
    write_word(0x14, (195 << 8) | 200);
    k_msleep(300);
    check((read_word(0x1a) & 0x0400) != 0, "low-voltage-status");
    check(gpio_pin_get_dt(&alert) == 0, "int-low");
    write_word(0x14, 0x00ff);
    write_word(0x1a, 0);
    check(gpio_pin_get_dt(&alert) == 0, "int-latched");
    write_word(0x0c, 0x8311);
    k_msleep(2);
    check(gpio_pin_get_dt(&alert) == 1, "int-clear");
    write_word(0x14, 180);
    k_msleep(300);
    check((read_word(0x1a) & 0x0200) != 0, "high-voltage-status");
    write_word(0x14, 0x00ff);
    write_word(0x1a, 0);
    write_word(0x0c, 0x8311);
    finish("voltage-alerts");

    wait_until(3000);
    write_word(0x0c, 0x8351);
    wait_until(4500);
    check((read_word(0x1a) & 0x3000) == 0x3000, "soc-alerts");
    check(gpio_pin_get_dt(&alert) == 0, "soc-int");
    write_word(0x1a, 0);
    write_word(0x0c, 0x8351);
    k_msleep(1100);
    check((read_word(0x1a) & 0x3000) == 0, "no-repeat-constant-soc");
    finish("soc-alerts");

    wait_until(6000);
    write_word(0x06, 0x2000);
    write_word(0x0c, 0x8391);
    const uint16_t asleep_soc = read_word(0x04);
    wait_until(7600);
    check(read_word(0x04) == asleep_soc, "sleep-hold");
    write_word(0x0c, 0x8311);
    k_msleep(1100);
    check(read_word(0x04) == 60 * 256, "sleep-wake");
    finish("software-sleep");

    wait_until(9000);
    write_word(0x0a, 0xffff);
    check((read_word(0x06) & 0x1000) != 0, "forced-hibernate");
    const uint16_t held = read_word(0x04);
    wait_until(11500);
    check(read_word(0x04) == held, "hibernate-hold");
    write_word(0x0a, 0);
    k_msleep(1100);
    check(read_word(0x04) == 70 * 256, "hibernate-wake");
    finish("hibernate");

    wait_until(13000);
    check((int16_t)read_word(0x16) == -48, "negative-crate");
    wait_until(15000);
    check((int16_t)read_word(0x16) == 48, "positive-crate");
    finish("crate");

    wait_until(16000);
    write_word(0x18, 0xa048);
    write_word(0x1a, 0x4000);
    wait_until(17500);
    check((read_word(0x1a) & 0x0800) != 0, "vreset-status");
    check(gpio_pin_get_dt(&alert) == 0, "vreset-int");
    finish("voltage-reset");

    wait_until(18000);
    write_word(0x06, 0x2000);
    const uint16_t bus_held = read_word(0x04);
    check(pm_device_action_run(i2c, PM_DEVICE_ACTION_SUSPEND) == 0, "i2c-suspend");
    gpio_pin_configure(gpio0, SDA_PIN, GPIO_OUTPUT_LOW);
    gpio_pin_configure(gpio0, SCL_PIN, GPIO_OUTPUT_LOW);
    k_msleep(2800);
    drive_bus(1);
    check(pm_device_action_run(i2c, PM_DEVICE_ACTION_RESUME) == 0, "i2c-resume");
    check(read_word(0x04) == bus_held, "bus-sleep-held");
    k_msleep(1100);
    check(read_word(0x08) == 0x12, "bus-sleep-wake");
    check(read_word(0x04) == 90 * 256, "bus-sleep-new-soc");
    finish("bus-sleep");

    wait_until(22500);
    check(i2c_write(i2c, NULL, 0, ADDR) == -EIO, "disconnected-nack");
    wait_until(23500);
    check(read_word(0x08) == 0x12, "reconnected-version");
    check(read_word(0x04) == 25 * 256, "reconnected-soc");
    finish("battery-power");

    check(write_bytes(0xfe, 0x54, 0, true) == -EIO, "reset-nack-last-byte");
    check(read_word(0x0c) == 0x971c, "reset-config");
    check(read_word(0x0a) == 0x8030, "reset-hib");
    k_msleep(300);
    check(read_word(0x04) == 25 * 256, "reset-soc");
    finish("reset");
    printk("failures %u\n", failures);
    return 0;
}
