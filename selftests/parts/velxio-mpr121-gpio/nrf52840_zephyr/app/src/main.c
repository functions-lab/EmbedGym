// MPR121 GPIO/LED selftest for nrf52840_zephyr (port of the AVR sketch): raw
// I2C on i2c0 at 0x5A. Electrodes 4..11 read back on P1.05, P1.06, P1.07,
// P1.08, P1.10, P1.11, P1.12, P1.13 (electrode 4 through a 10k/100k divider).
// Microseconds come from the 32768 Hz system tick.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x5a

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct device *const gpio1 = DEVICE_DT_GET(DT_NODELABEL(gpio1));
static const gpio_pin_t PINS[8] = {5, 6, 7, 8, 10, 11, 12, 13};
static unsigned failures = 0;
static unsigned checks = 0;

static int64_t micros(void) { return k_ticks_to_us_floor64(k_uptime_ticks()); }

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

static bool high(uint8_t i) { return gpio_pin_get(gpio1, PINS[i]) == 1; }
static void input(uint8_t i) { gpio_pin_configure(gpio1, PINS[i], GPIO_INPUT); }
static void settle(void) { k_msleep(2); }
static void level(uint8_t i, bool expected, const char *name) { settle(); check(high(i) == expected, name); }

int main(void)
{
    for (uint8_t i = 0; i < 8; i++) input(i);

    write_reg(0x80, 0x63); write_reg(0x76, 0xff); write_reg(0x75, 0); write_reg(0x77, 0xff);
    for (uint8_t i = 0; i < 8; i++) { write_reg(0x78, 1 << i); level(i, true, "pushpull-high"); write_reg(0x79, 1 << i); level(i, false, "pushpull-low"); }
    write_reg(0x7a, 0xff); settle(); check(read_reg(0x75) == 0xff, "toggle-data");
    write_reg(0x7a, 0xff); settle(); check(read_reg(0x78) == 0, "toggle-clear");
    write_reg(0x77, 0); write_reg(0x76, 0); gpio_pin_configure(gpio1, PINS[0], GPIO_OUTPUT_LOW);
    write_reg(0x77, 1); settle(); check((read_reg(0x75) & 1) == 0, "divided-input-low");
    gpio_pin_set(gpio1, PINS[0], 1); settle(); check((read_reg(0x75) & 1) == 1, "divided-input-high");
    write_reg(0x77, 0); input(0);
    write_reg(0x73, 0xf0); write_reg(0x74, 0xf0); write_reg(0x77, 0xf0); settle(); check((read_reg(0x75) & 0xf0) == 0xf0, "input-pullup");
    write_reg(0x73, 0); settle(); check((read_reg(0x75) & 0xf0) == 0, "input-pulldown"); write_reg(0x77, 0);
    write_reg(0x74, 4); write_reg(0x76, 4); write_reg(0x75, 4); write_reg(0x77, 4); level(2, true, "low-drain-release"); write_reg(0x79, 4); level(2, false, "low-drain-active"); write_reg(0x78, 4); level(2, true, "low-drain-rerelease");
    write_reg(0x77, 0); write_reg(0x73, 8); write_reg(0x74, 8); write_reg(0x76, 8); write_reg(0x75, 0); write_reg(0x77, 8); level(3, false, "high-drain-release"); write_reg(0x78, 8); level(3, true, "high-drain-active"); write_reg(0x79, 8); level(3, false, "high-drain-rerelease");
    write_reg(0x77, 0); write_reg(0x73, 0); write_reg(0x74, 0); write_reg(0x76, 0xff); write_reg(0x75, 0xff); write_reg(0x77, 0xff);
    for (uint8_t code = 1; code <= 15; code++) {
        write_reg(0x81, code | (code << 4)); write_reg(0x82, code | (code << 4)); write_reg(0x83, code | (code << 4)); write_reg(0x84, code | (code << 4)); k_msleep(20);
        unsigned edges[8] = {0}; unsigned highs[8] = {0}; bool previous[8];
        for (uint8_t i = 0; i < 8; i++) previous[i] = high(i);
        unsigned samples = 0; int64_t start = micros();
        while (micros() - start < 64000) {
            for (uint8_t i = 0; i < 8; i++) { bool h = high(i); highs[i] += h; if (h != previous[i]) { edges[i]++; previous[i] = h; } }
            samples++;
        }
        for (uint8_t i = 0; i < 8; i++) {
            check(edges[i] >= 14 && edges[i] <= 18, "pwm-125hz");
            float duty = (float)highs[i] / samples; check(duty > (float)code / 16 - 0.03f && duty < (float)code / 16 + 0.03f, "pwm-duty");
        }
    }
    for (uint8_t reg = 0x81; reg <= 0x84; reg++) write_reg(reg, 0);
    k_msleep(10);
    for (uint8_t i = 0; i < 8; i++) check(high(i), "pwm-zero-steady");
    write_reg(0x79, 0xff); settle(); for (uint8_t i = 0; i < 8; i++) check(!high(i), "pwm-zero-data");
    write_reg(0x75, 0xff); write_reg(0x5d, 0x20); write_reg(0x5e, 0xc5); level(0, false, "sensing-overrides-gpio");
    write_reg(0x5e, 0xc4); level(0, true, "sensing-restores-gpio");
    write_reg(0x5e, 0xf4); level(0, false, "proximity-overrides-gpio");
    write_reg(0x5e, 0xd4); level(0, true, "short-proximity-keeps-gpio");
    write_reg(0x5e, 0); write_reg(0x5c, 0xd0); write_reg(0x5d, 0xe0);
    for (uint8_t reg = 0x81; reg <= 0x84; reg++) write_reg(reg, 0x88);
    write_reg(0x5e, 0xc1); k_msleep(30);
    unsigned transitions = 0; bool jitter = false; bool previous = high(1); int64_t start = micros(), last = start;
    while (micros() - start < 100000) {
        bool h = high(1);
        if (h != previous) {
            int64_t now = micros();
            if (transitions) { int64_t gap = now - last; if (gap < 3800 || gap > 4200) jitter = true; check(gap >= 2000 && gap <= 6500, "conversion-deferred-edge"); }
            transitions++; last = now; previous = h;
        }
    }
    check(transitions >= 20 && transitions <= 28 && jitter, "conversion-inhibits-pwm");
    write_reg(0x5e, 0);
    printk("checks %u\nfailures %u\n", checks, failures);
    return 0;
}
