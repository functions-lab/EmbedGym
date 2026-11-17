// MAX17048 library selftest for nrf52840_zephyr (port of code/code.ino, which
// uses Adafruit_MAX17048; Zephyr has no port of it, so this replays its bus
// traffic): each lib_* function issues the transfers of the library method of
// the same name, through BusIO's 1- or 2-byte MSB-first registers. Raw I2C on
// i2c0, INT on the max17048-int alias. Times count from reset.
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x36
#define ALERT_RESET_INDICATOR 0x01
#define ALERT_VOLTAGE_LOW 0x04

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec alert = GPIO_DT_SPEC_GET(DT_ALIAS(max17048_int), gpios);

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

static uint32_t reg_read(uint8_t reg, int width)
{
    uint8_t data[2] = {0, 0};
    if (i2c_write_read(i2c, ADDR, &reg, 1, data, width) != 0) {
        return 0xffffffff;
    }
    return width == 2 ? ((uint32_t)data[0] << 8) | data[1] : data[0];
}

static bool reg_write(uint8_t reg, uint32_t value, int width)
{
    uint8_t buf[3] = {reg, 0, 0};
    if (width == 2) {
        buf[1] = value >> 8;
        buf[2] = value & 255;
    } else {
        buf[1] = value & 255;
    }
    return i2c_write(i2c, buf, 1 + width, ADDR) == 0;
}

static uint32_t bits_read(uint8_t reg, int width, int bits, int shift)
{
    return (reg_read(reg, width) >> shift) & ((1u << bits) - 1);
}

static bool bits_write(uint8_t reg, int width, int bits, int shift, uint32_t data)
{
    uint32_t value = reg_read(reg, width);
    uint32_t mask = (1u << bits) - 1;
    value = (value & ~(mask << shift)) | ((data & mask) << shift);
    return reg_write(reg, value, width);
}

static bool detected(void) { return i2c_write(i2c, NULL, 0, ADDR) == 0; }
static uint32_t lib_get_ic_version(void) { return reg_read(0x08, 2); }
static bool lib_is_device_ready(void) { return (lib_get_ic_version() & 0xfff0) == 0x0010; }
static uint32_t lib_get_chip_id(void) { return reg_read(0x19, 1); }
static uint32_t lib_get_alert_status(void) { return reg_read(0x1a, 1) & 0x7f; }
static bool lib_clear_alert_flag(uint8_t flags) { return reg_write(0x1a, reg_read(0x1a, 1) & ~flags, 1); }

static bool lib_reset(void)
{
    if (reg_write(0xfe, 0x5400, 2)) return false;
    for (int retries = 0; retries < 3; retries++) {
        if (lib_clear_alert_flag(ALERT_RESET_INDICATOR)) return true;
    }
    return false;
}

static void lib_enable_sleep(bool en) { bits_write(0x06, 1, 1, 5, en); }
static void lib_sleep(bool s) { bits_write(0x0c, 2, 1, 7, s); }

static bool lib_begin(void)
{
    if (!detected() || !lib_is_device_ready() || !lib_reset()) return false;
    lib_enable_sleep(false);
    lib_sleep(false);
    return true;
}

static float lib_cell_voltage(void)
{
    if (!lib_is_device_ready()) return NAN;
    return reg_read(0x02, 2) * 78.125f / 1000000;
}

static float lib_cell_percent(void)
{
    if (!lib_is_device_ready()) return NAN;
    return reg_read(0x04, 2) / 256.0f;
}

static float lib_charge_rate(void)
{
    if (!lib_is_device_ready()) return NAN;
    return (int16_t)reg_read(0x16, 2) * 0.208f;
}

static void lib_set_reset_voltage(float reset_v)
{
    int value = (int)(reset_v / 0.04f);
    bits_write(0x18, 1, 7, 0, value > 127 ? 127 : value < 0 ? 0 : value);
}

static float lib_get_reset_voltage(void) { return bits_read(0x18, 1, 7, 0) * 0.04f; }

static void lib_set_alert_voltages(float minv, float maxv)
{
    reg_write(0x14, (uint8_t)(minv / 0.02f), 1);
    reg_write(0x15, (uint8_t)(maxv / 0.02f), 1);
}

static void lib_get_alert_voltages(float *minv, float *maxv)
{
    *minv = reg_read(0x14, 1) * 0.02f;
    *maxv = reg_read(0x15, 1) * 0.02f;
}

static bool lib_is_active_alert(void) { return bits_read(0x0c, 2, 1, 5); }
static float lib_get_activity_threshold(void) { return reg_read(0x0b, 1) * 0.00125f; }
static void lib_set_activity_threshold(float threshold) { reg_write(0x0b, (int)(threshold / 0.00125f), 1); }
static float lib_get_hibernation_threshold(void) { return reg_read(0x0a, 1) * 0.208f; }
static void lib_set_hibernation_threshold(float threshold) { reg_write(0x0a, (int)(threshold / 0.208f), 1); }
static bool lib_is_hibernating(void) { return bits_read(0x06, 1, 1, 4); }

static void lib_hibernate(void)
{
    reg_write(0x0b, 0xff, 1);
    reg_write(0x0a, 0xff, 1);
}

static void lib_wake(void)
{
    reg_write(0x0b, 0, 1);
    reg_write(0x0a, 0, 1);
}

static void lib_quick_start(void) { bits_write(0x06, 1, 1, 6, 1); }

static void word_write(uint8_t reg, uint16_t value) { check(reg_write(reg, value, 2), "raw-write"); }

int main(void)
{
    gpio_pin_configure_dt(&alert, GPIO_INPUT);

    check(lib_begin(), "begin");
    check(lib_is_device_ready(), "ready");
    check(lib_get_ic_version() == 0x12, "version");
    check(lib_get_chip_id() == 0x48, "factory-id");
    k_msleep(300);
    check(fabsf(lib_cell_voltage() - 3.8f) < 0.002f, "voltage");
    check(fabsf(lib_cell_percent() - 50) < 0.01f, "soc");
    check(fabsf(lib_charge_rate()) < 0.01f, "rate");
    finish("stock-init");

    // Rev7 ignores 8-bit writes. These unchanged library setters issue them.
    lib_set_reset_voltage(3.2f);
    check(fabsf(lib_get_reset_voltage() - 0.88f) < 0.01f, "reset-voltage-byte-noop");
    lib_set_alert_voltages(3.6f, 4.2f);
    float minv, maxv;
    lib_get_alert_voltages(&minv, &maxv);
    check(fabsf(minv) < 0.01f && fabsf(maxv - 5.1f) < 0.01f, "voltage-alert-byte-noop");
    lib_set_activity_threshold(0.1f);
    check(fabsf(lib_get_activity_threshold() - 0.06f) < 0.001f, "activity-byte-noop");
    lib_set_hibernation_threshold(10);
    check(fabsf(lib_get_hibernation_threshold() - 26.624f) < 0.01f, "hib-byte-noop");
    lib_hibernate();
    check(!lib_is_hibernating(), "hibernate-byte-noop");
    lib_wake();
    check(fabsf(lib_get_activity_threshold() - 0.06f) < 0.001f, "wake-byte-noop");
    lib_quick_start();
    check(lib_cell_percent() != 0, "quick-byte-noop");
    check(lib_clear_alert_flag(ALERT_RESET_INDICATOR), "clear-byte-ack");
    check(lib_get_alert_status() == 1, "clear-byte-noop");
    finish("stock-byte-setters");

    wait_until(1500);
    word_write(0x14, (195 << 8) | 200);
    k_msleep(300);
    check(lib_is_active_alert(), "alert-active");
    check((lib_get_alert_status() & ALERT_VOLTAGE_LOW) != 0, "alert-reason");
    check(gpio_pin_get_dt(&alert) == 0, "alert-int");
    lib_clear_alert_flag(ALERT_VOLTAGE_LOW);
    check((lib_get_alert_status() & ALERT_VOLTAGE_LOW) != 0, "clear-byte-noop-low");
    word_write(0x14, 0x00ff);
    word_write(0x1a, 0);
    word_write(0x0c, 0x971c);
    finish("stock-alert-getters");

    wait_until(3000);
    lib_enable_sleep(true);
    lib_sleep(true);
    wait_until(4500);
    check(fabsf(lib_cell_percent() - 60) < 0.01f, "sleep-enable-byte-noop");
    lib_sleep(false);
    word_write(0x06, 0x2000);
    lib_sleep(true);
    const float held = lib_cell_percent();
    wait_until(6500);
    check(lib_cell_percent() == held, "sleep-word-config-hold");
    lib_sleep(false);
    k_msleep(1100);
    check(fabsf(lib_cell_percent() - 70) < 0.01f, "sleep-word-wake");
    lib_enable_sleep(false);
    finish("stock-sleep");

    wait_until(8000);
    check(fabsf(lib_charge_rate() + 9.984f) < 0.01f, "negative-rate");
    wait_until(10000);
    check(fabsf(lib_charge_rate() - 9.984f) < 0.01f, "positive-rate");
    check(fabsf(lib_cell_voltage() - 4.1f) < 0.002f, "fresh-voltage");
    finish("stock-readings");

    check(lib_reset(), "reset-nack-success");
    check(lib_get_alert_status() == 1, "reset-indicator-byte-noop");
    k_msleep(300);
    check(lib_cell_percent() > 69 && lib_cell_percent() < 71, "reset-cell-retained");
    finish("stock-reset");
    printk("failures %u\n", failures);
    return 0;
}
