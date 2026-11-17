// AMG8833 jumper-address library selftest for nrf52840_zephyr: Zephyr's
// panasonic,amg88xx driver on a node at 0x68 (initial reset and 10 fps at
// init, 64-pixel fetch, threshold
// attributes, a threshold trigger on INT that enables absolute mode) in place
// of the Adafruit library. The driver has no thermistor, partial read, moving
// average, hysteresis, difference mode, INT disable or flag clear, so those
// go to the part as raw i2c0 transfers. Prints the AVR sketch's lines.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define THERMAL DT_NODELABEL(thermal)
#define ADDR DT_REG_ADDR(THERMAL)

static const struct device *const camera = DEVICE_DT_GET(THERMAL);
static const struct i2c_dt_spec bus = I2C_DT_SPEC_GET(THERMAL);
static const struct gpio_dt_spec int_pin = GPIO_DT_SPEC_GET(THERMAL, int_gpios);
static const struct sensor_trigger threshold = {.type = SENSOR_TRIG_THRESHOLD, .chan = SENSOR_CHAN_AMBIENT_TEMP};

static volatile uint16_t triggers = 0;
static uint16_t failures = 0;
static uint16_t section_start = 0;
static struct sensor_value pixels[64];
static uint8_t raw[128];

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

static void on_threshold(const struct device *dev, const struct sensor_trigger *trigger) { triggers++; }

static void write8(uint8_t reg, uint8_t value) { check(i2c_reg_write_byte_dt(&bus, reg, value) == 0, "I2C-write"); }
static void read_bytes(uint8_t reg, uint8_t *data, uint32_t size)
{
    check(i2c_burst_read_dt(&bus, reg, data, size) == 0, "I2C-read");
}
static uint8_t read_reg(uint8_t reg)
{
    uint8_t value;
    read_bytes(reg, &value, 1);
    return value;
}

static float read_thermistor(void)
{
    uint8_t data[2];
    read_bytes(0x0e, data, 2);
    uint16_t value = ((uint16_t)data[1] << 8) | data[0];
    float magnitude = value & 0x7ff;
    return ((value & 0x800) ? -magnitude : magnitude) * 0.0625f;
}

static void read_pixels(void)
{
    check(sensor_sample_fetch(camera) == 0, "driver-fetch");
    check(sensor_channel_get(camera, SENSOR_CHAN_AMBIENT_TEMP, pixels) == 0, "driver-get");
}

static int64_t micro_celsius(const struct sensor_value *value) { return (int64_t)value->val1 * 1000000 + value->val2; }

static void set_level(enum sensor_attribute attr, double celsius)
{
    struct sensor_value value;
    sensor_value_from_double(&value, celsius);
    check(sensor_attr_set(camera, SENSOR_CHAN_AMBIENT_TEMP, attr, &value) == 0, "driver-attr");
}

static void set_hysteresis(int count) { write8(0x0c, count & 0xff); write8(0x0d, (count & 0x0f00) >> 8); }
static void clear_interrupt(void) { write8(0x01, 0x30); }
static int int_level(void) { return gpio_pin_get_raw(int_pin.port, int_pin.pin); }

int main(void)
{
    check(device_is_ready(camera), "stock-begin"); k_msleep(210);
    check(read_thermistor() == -12.0625f, "stock-signed-thermistor");
    read_pixels(); read_bytes(0x80, raw, 128);
    for (uint8_t i = 0; i < 64; i++) {
        check(micro_celsius(&pixels[i]) == 25000000 && raw[2 * i] == 100 && raw[2 * i + 1] == 0, "stock-full-array");
    }
    finish("stock-init");

    until(1250); read_pixels(); read_bytes(0x80, raw, 128);
    for (uint8_t i = 0; i < 64; i++) {
        int value = raw[2 * i] | (raw[2 * i + 1] << 8);
        if (value & 0x800) value -= 4096;
        check(micro_celsius(&pixels[i]) == (i - 32) * 250000 && value == i - 32, "stock64-independent-pixels");
    }
    check(read_thermistor() == 30.0625f, "stock-fresh-thermistor");
    read_bytes(0x80, raw, 14);
    check(raw[12] == 230 && raw[13] == 0x0f, "stock-partial-array");
    write8(0x07, 0x20); check(read_reg(7) == 32, "stock-average-on");
    until(1800); read_pixels();
    check(micro_celsius(&pixels[0]) == 25000000 && micro_celsius(&pixels[63]) == 25000000, "stock-average-settled");
    write8(0x07, 0); check(read_reg(7) == 0, "stock-average-off");
    finish("stock-data-average");

    set_level(SENSOR_ATTR_UPPER_THRESH, 30); set_level(SENSOR_ATTR_LOWER_THRESH, 10);
    check(read_reg(8) == 120 && read_reg(10) == 40, "stock-threshold-attributes");
    set_hysteresis(100); clear_interrupt();
    check(sensor_trigger_set(camera, &threshold, on_threshold) == 0 && read_reg(3) == 3, "stock-trigger-absolute");
    until(2250); uint8_t bitmap[8]; read_bytes(0x10, bitmap, 8);
    check(bitmap[0] == 1 && bitmap[7] == 0 && int_level() == 0 && triggers == 1, "stock-upper-table-and-INT");
    write8(0x03, 0x02); k_msleep(1); check(int_level() == 1 && (read_reg(4) & 2), "stock-disable-mask");
    write8(0x03, 0x03); k_msleep(1); check(int_level() == 0, "stock-reenable-latch");
    clear_interrupt(); k_msleep(1);
    check(read_reg(4) == 0 && int_level() == 1 && triggers == 2, "stock-clear-interrupt");
    until(2750); clear_interrupt();
    set_level(SENSOR_ATTR_UPPER_THRESH, 4); set_level(SENSOR_ATTR_LOWER_THRESH, -4); set_hysteresis(0);
    write8(0x03, 0x01); clear_interrupt();
    until(3150); read_bytes(0x10, bitmap, 8); check(bitmap[7] == 128, "stock-difference-mode");
    read_bytes(0x10, bitmap, 1); check(bitmap[0] == 0, "stock-partial-bitmap");
    until(3350); clear_interrupt(); k_msleep(150); check(read_reg(4) == 0, "stock-difference-recovery");
    finish("stock-interrupts");
    printk("failures %u\n", failures);
    return 0;
}
