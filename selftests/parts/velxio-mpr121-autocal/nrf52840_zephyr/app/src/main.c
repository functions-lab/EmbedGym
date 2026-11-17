// MPR121 autoconfiguration selftest for nrf52840_zephyr (port of the AVR
// sketch): raw I2C on i2c0 at 0x5A, INT on the mpr121-int alias. Times count
// from reset.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x5a

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec int_pin = GPIO_DT_SPEC_GET(DT_ALIAS(mpr121_int), gpios);

static unsigned failures = 0;
static unsigned checks = 0;

static void until(int64_t when) { while (k_uptime_get() < when) k_msleep(1); }

static void check(bool valid, const char *name)
{
    checks++;
    if (!valid) {
        printk("FAIL %s\n", name);
        failures++;
    }
}

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    check(i2c_write(i2c, buf, 2, ADDR) == 0, "write-ack");
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t data = 0;
    i2c_write_read(i2c, ADDR, &reg, 1, &data, 1);
    return data;
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    i2c_write_read(i2c, ADDR, &reg, 1, data, 2);
    return data[0] | (uint16_t)data[1] << 8;
}

static int int_level(void) { return gpio_pin_get_dt(&int_pin); }

static void configure(uint8_t control, uint8_t options)
{
    write_reg(0x80, 0x63); write_reg(0x1e, 20); write_reg(0x5d, 0x20); write_reg(0x41, 12); write_reg(0x42, 6);
    write_reg(0x7b, control); write_reg(0x7c, options); write_reg(0x7d, 200); write_reg(0x7e, 130); write_reg(0x7f, 180); write_reg(0x5e, 0x41);
}

int main(void)
{
    gpio_pin_configure_dt(&int_pin, GPIO_INPUT);

    for (uint8_t bva = 0; bva < 4; bva++) {
        configure(1 | (bva << 2), 0); k_msleep(80); uint16_t data = read_word(4); uint16_t baseline = (uint16_t)read_reg(0x1e) << 2;
        check(data >= 520 && data <= 800, "auto-physical-range"); check(read_reg(0x5f) > 0, "auto-current"); check(read_reg(2) == 0, "auto-no-oor");
        if (bva == 0) check(baseline == 80, "bva-retain");
        if (bva == 1) check(baseline == 0, "bva-clear");
        if (bva == 2) check(baseline % 8 == 0 && baseline <= data && data - baseline < 8, "bva-high-five");
        if (bva == 3) check(baseline <= data && data - baseline < 4, "bva-all-ten");
    }
    for (uint8_t code = 0; code < 4; code++) {
        configure((code << 6) | (code << 4) | 0x0d, 0x80); k_msleep(80);
        check(read_reg(0x5f) > 16, "auto-ffi-retry-current"); check(read_reg(0x6c) == 0, "scts-preserved-cdt"); check((read_reg(3) & 0xc0) == 0, "auto-flags-clear");
    }
    configure(0x0f, 0); write_reg(0x5e, 0); write_reg(0x2b, 1); write_reg(0x2c, 16); write_reg(0x5e, 0xc1); k_msleep(80);
    uint8_t current = read_reg(0x5f); uint8_t baseline = read_reg(0x1e);
    until(1100); check(read_word(4) < 520 && (read_word(0) & 1), "held-below-lsl");
    check(read_reg(0x5f) == current && read_reg(0x1e) == baseline && read_reg(2) == 0, "are-preserves-touch");
    until(1450); check((read_word(0) & 1) == 0, "auto-touch-release");
    until(1650); check(read_reg(0x5f) < current && read_word(4) >= 520 && read_word(4) <= 800, "are-baseline-drift-retunes");
    until(1800); configure(0xff, 0x87); k_msleep(100);
    check(int_level() == 0, "fault-irq"); check(read_reg(2) == 1 && (read_reg(3) & 0xc0) == 0xc0, "auto-retry-failure-flags");
    k_msleep(5); check(int_level() == 0, "fault-irq-reassert");
    until(2300); check(read_reg(2) == 0 && (read_reg(3) & 0x40) == 0, "are-recovery"); check(read_reg(0x5f) > 16, "are-recovery-physical-current");
    printk("checks %u\nfailures %u\n", checks, failures);
    return 0;
}
