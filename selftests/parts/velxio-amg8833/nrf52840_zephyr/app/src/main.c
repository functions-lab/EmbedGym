// AMG8833 register-level selftest for nrf52840_zephyr (port of the AVR
// sketch): raw I2C on i2c0 at 0x69, INT on the amg8833-int alias. Times
// count from reset.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x69

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec int_pin = GPIO_DT_SPEC_GET(DT_ALIAS(amg8833_int), gpios);

static uint16_t failures = 0;
static uint16_t section_start = 0;

static void until(int64_t at_ms) { while (k_uptime_get() < at_ms) k_msleep(1); }

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

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    check(i2c_write(i2c, buf, 2, ADDR) == 0, "I2C-write");
}

static void read_bytes(uint8_t reg, uint8_t *data, size_t size)
{
    check(i2c_write_read(i2c, ADDR, &reg, 1, data, size) == 0, "I2C-read");
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t data;
    read_bytes(reg, &data, 1);
    return data;
}

static int pixel(uint8_t index)
{
    uint8_t data[2];
    read_bytes(0x80 + 2 * index, data, 2);
    int value = data[0] | ((data[1] & 15) << 8);
    return value & 0x800 ? value - 4096 : value;
}

static float thermistor(void)
{
    uint8_t data[2];
    read_bytes(0x0e, data, 2);
    int value = data[0] | (data[1] << 8);
    return ((value & 0x800) ? -(value & 0x7ff) : value) / 16.0f;
}

static void levels(int high, int low, int hysteresis)
{
    write_reg(8, high & 255); write_reg(9, (high >> 8) & 15);
    write_reg(10, low & 255); write_reg(11, (low >> 8) & 15);
    write_reg(12, hysteresis & 255); write_reg(13, (hysteresis >> 8) & 15);
}

static void clear(void) { write_reg(5, 6); }
static int int_level(void) { return gpio_pin_get_dt(&int_pin); }

int main(void)
{
    gpio_pin_configure_dt(&int_pin, GPIO_INPUT);

    check(read_reg(0) == 0 && read_reg(2) == 0 && read_reg(3) == 0, "defaults");
    until(220);
    for (uint8_t i = 0; i < 64; i++) check(pixel(i) == i - 32, "all64-signed-pixels");
    check(thermistor() == -12.0625f, "signed-independent-thermistor");
    finish("encoding");

    write_reg(2, 0xfe); write_reg(3, 0xfe); write_reg(9, 0xf0);
    check(read_reg(2) == 0 && read_reg(3) == 2 && read_reg(9) == 0, "unused-bit-masks");
    until(1750); check(pixel(0) == 100 && pixel(63) == 100, "physical-frame-inputs");
    until(1900); write_reg(2, 1); write_reg(7, 0x20);
    until(2800); check(pixel(0) == 100, "one-fps-not-early");
    until(3050); check(pixel(0) == 120 && thermistor() == 25, "two-frame-average");
    until(4050); check(pixel(0) == 140, "average-settles");
    write_reg(0x1f, 0x50); write_reg(0x1f, 0x45); write_reg(0x1f, 0x57); write_reg(7, 0); write_reg(0x1f, 0);
    check(read_reg(7) == 0, "vendor-average-sequence");
    finish("frame-average");

    until(4300); write_reg(0, 0x10); write_reg(2, 0); write_reg(1, 0x3f);
    until(4700); write_reg(0, 0); k_msleep(51); write_reg(1, 0x3f); k_msleep(3); write_reg(1, 0x30);
    check(read_reg(2) == 1 && read_reg(3) == 2 && read_reg(7) == 0, "wake-config-retained");
    check(pixel(0) == 0, "initial-reset-pixel-clear");
    until(5800); check(pixel(0) == 180 && thermistor() == 5.5f, "wake-fresh-inputs");
    write_reg(1, 0x30); check(pixel(0) == 180, "flag-reset-data-retained");
    finish("sleep-reset");

    until(6005); write_reg(2, 0); levels(120, 40, 100); write_reg(3, 3);
    until(6200); clear();
    until(6650); check(read_reg(0x17) == 128 && int_level() == 0, "upper-pixel63-INT");
    clear(); until(6850); check((read_reg(4) & 2) && int_level() == 0, "clear-reasserts");
    until(7150); clear(); until(7250); check(read_reg(0x17) == 128, "upper-hysteresis-hold");
    until(7650); clear(); until(7750); check(read_reg(4) == 0 && int_level() == 1, "upper-inclusive-recovery");
    until(8150); check(read_reg(0x10) == 2 && int_level() == 0, "lower-pixel1-INT");
    until(8650); clear(); until(8750); check(read_reg(0x10) == 2, "lower-hysteresis-hold");
    until(9150); clear(); until(9250); check(read_reg(4) == 0, "lower-inclusive-recovery");
    write_reg(3, 2);
    until(9650); check(read_reg(0x10) == 4 && int_level() == 1, "INT-output-mask-retains-table");
    write_reg(3, 3); k_msleep(1); check(int_level() == 0, "INT-enable-latched");
    until(10150); clear(); until(10250); check(read_reg(4) == 0, "exact-upper-limit");
    finish("interrupts");

    levels(16, -16, 0); write_reg(3, 1); clear();
    until(10650); check(read_reg(0x10) == 8, "difference-upper");
    until(11050); check(read_reg(0x17) == 16, "difference-lower");
    until(11150); clear(); until(11250); check(read_reg(4) == 0, "difference-clears");
    until(11650); clear(); until(11750); check(read_reg(4) == 0, "difference-stable-recovers");
    finish("difference");

    until(12150); check((read_reg(4) & 4) != 0, "ADC-fault");
    write_reg(5, 4); check((read_reg(4) & 4) == 0, "ADC-selective-clear");
    until(12250); check((read_reg(4) & 4) != 0, "ADC-fault-reassert");
    until(13150); write_reg(1, 0x30); until(13250); check((read_reg(4) & 4) == 0, "ADC-fault-recovery");
    finish("ADC-fault");

    until(13500); levels(120, 40, 100); write_reg(3, 3); write_reg(7, 0x20); write_reg(2, 1); write_reg(1, 0x3f);
    check(read_reg(3) == 3 && read_reg(7) == 0x20 && read_reg(2) == 1 && read_reg(8) == 120,
          "initial-reset-retains-config");
    k_msleep(3); write_reg(1, 0x30); until(15600); check(pixel(0) == 100, "initial-reset-frames");
    write_reg(7, 0); write_reg(2, 0); write_reg(3, 2);
    until(16500); write_reg(0, 0x20); clear();
    until(76000); check(pixel(62) == 100, "standby60-not-early");
    until(76750); check(pixel(62) == 160 && (read_reg(0x17) & 64), "standby60-frame-and-table");
    write_reg(0, 0x21); clear();
    until(86500); check(pixel(62) == 160, "standby10-not-early");
    until(87000); check(pixel(62) == 180 && (read_reg(0x17) & 64), "standby10-frame");
    write_reg(0, 0); until(87250); check(pixel(62) == 180, "standby-normal-return");
    finish("standby-reset");
    printk("failures %u\n", failures);
    return 0;
}
