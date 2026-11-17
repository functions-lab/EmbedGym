// MPR121 library selftest for nrf52840_zephyr (variant of code/code.ino,
// which uses Adafruit_MPR121 1.2.1; Zephyr has no MPR121 driver, so this
// replays its bus traffic on i2c0): begin() probes the address, soft-resets,
// stops, checks CONFIG2, writes the thresholds, baseline filters, debounce,
// CONFIG1/2 and autoconfiguration off (begin's default), then runs 12
// electrodes. Every register write outside ECR and the GPIO block saves ECR,
// stops, writes and restores ECR, as the library does. INT on the mpr121-int
// alias. Times count from reset.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDRESS 0x5c

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec int_pin = GPIO_DT_SPEC_GET(DT_ALIAS(mpr121_int), gpios);

static unsigned failures = 0;

static void until(int64_t at_ms) { while (k_uptime_get() < at_ms) k_msleep(1); }

static void check(bool valid, const char *name)
{
    if (!valid) {
        printk("FAIL %s\n", name);
        failures++;
    }
}

static bool probe(uint8_t address) { return i2c_write(i2c, NULL, 0, address) == 0; }

static void raw_write(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    i2c_write(i2c, buf, 2, ADDRESS);
}

static uint16_t read_register(uint8_t reg, size_t width)
{
    uint8_t data[2] = {0, 0};
    i2c_write_read(i2c, ADDRESS, &reg, 1, data, width);
    return data[0] | (uint16_t)data[1] << 8;
}

static uint8_t read_register8(uint8_t reg) { return read_register(reg, 1); }

static void write_register(uint8_t reg, uint8_t value)
{
    bool stop_required = !(reg == 0x5e || (0x73 <= reg && reg <= 0x7a));
    uint8_t ecr_backup = read_register8(0x5e);
    if (stop_required) raw_write(0x5e, 0x00);
    raw_write(reg, value);
    if (stop_required) raw_write(0x5e, ecr_backup);
}

static void set_thresholds(uint8_t touch, uint8_t release)
{
    for (uint8_t i = 0; i < 12; i++) {
        write_register(0x41 + 2 * i, touch);
        write_register(0x42 + 2 * i, release);
    }
}

static uint16_t filtered_data(uint8_t t) { return t > 12 ? 0 : read_register(0x04 + t * 2, 2); }
static uint16_t baseline_data(uint8_t t) { return t > 12 ? 0 : (uint16_t)read_register8(0x1e + t) << 2; }
static uint16_t touched(void) { return read_register(0x00, 2) & 0x0fff; }

static bool begin(void)
{
    if (!probe(ADDRESS)) return false;
    write_register(0x80, 0x63);
    k_msleep(1);
    write_register(0x5e, 0x00);
    if (read_register8(0x5d) != 0x24) return false;
    set_thresholds(12, 6);
    write_register(0x2b, 0x01); write_register(0x2c, 0x01); write_register(0x2d, 0x0e); write_register(0x2e, 0x00);
    write_register(0x2f, 0x01); write_register(0x30, 0x05); write_register(0x31, 0x01); write_register(0x32, 0x00);
    write_register(0x33, 0x00); write_register(0x34, 0x00); write_register(0x35, 0x00);
    write_register(0x5b, 0); write_register(0x5c, 0x10); write_register(0x5d, 0x20);
    write_register(0x7b, 0x0a);
    write_register(0x5e, 0x80 + 12);
    return true;
}

int main(void)
{
    gpio_pin_configure_dt(&int_pin, GPIO_INPUT);

    for (uint8_t address = 0x5a; address <= 0x5d; address++) check(probe(address) == (address == ADDRESS), "address-probe");
    check(begin(), "stock-begin"); k_msleep(120);
    for (uint8_t i = 0; i < 12; i++) {
        check(filtered_data(i) == 165, "stock-filtered");
        check(baseline_data(i) >= 160 && baseline_data(i) <= 164, "stock-baseline");
    }
    check(filtered_data(13) == 0 && baseline_data(13) == 0, "stock-channel-guard");
    set_thresholds(80, 70); until(500); check(touched() == 0, "stock-high-threshold");
    until(650); set_thresholds(12, 6);
    check(read_register8(0x41) == 12 && read_register8(0x42) == 6, "stock-threshold-restore");

    uint16_t previous = 0;
    bool done = false;
    for (;;) {
        uint16_t mask = touched();
        if (mask != previous) { printk("mask %u\n", mask); previous = mask; }
        if (!done && k_uptime_get() >= 4700) {
            done = true; check(mask == 0, "stock-release"); check(gpio_pin_get_dt(&int_pin) == 1, "stock-irq-release");
            printk("failures %u\n", failures);
        }
        k_msleep(2);
    }
    return 0;
}
