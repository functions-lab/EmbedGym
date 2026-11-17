// MPR121 register-level selftest for nrf52840_zephyr (port of the AVR
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

static uint16_t failures = 0;

static void until(int64_t at_ms) { while (k_uptime_get() < at_ms) k_msleep(1); }

static void check(bool condition, const char *name)
{
    if (!condition) {
        failures++;
        printk("FAIL ");
        for (const char *c = name; *c; c++) printk("%c", *c == ' ' ? '-' : *c);
        printk("\n");
    }
}

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    check(i2c_write(i2c, buf, 2, ADDR) == 0, "I2C write");
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t data = 0;
    check(i2c_write_read(i2c, ADDR, &reg, 1, &data, 1) == 0, "I2C read");
    return data;
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    check(i2c_write_read(i2c, ADDR, &reg, 1, data, 2) == 0, "I2C word");
    return data[0] | (uint16_t)data[1] << 8;
}

static int int_level(void) { return gpio_pin_get_dt(&int_pin); }
static void stop(void) { write_reg(0x5e, 0); }
static void start(uint8_t ecr) { write_reg(0x5e, ecr); k_msleep(80); }
static void reset(void) { write_reg(0x80, 0x63); k_msleep(1); write_reg(0x5d, 0x20); }

int main(void)
{
    gpio_pin_configure_dt(&int_pin, GPIO_INPUT);

    reset(); check(read_reg(0x5c) == 0x10 && read_reg(0x5e) == 0, "reset");
    write_reg(0x41, 12); write_reg(0x42, 6); start(0xc1);
    printk("init-data %u baseline %u config %u ecr %u\n", read_word(4), read_reg(0x1e), read_reg(0x5d), read_reg(0x5e));
    check(read_word(4) == 165, "physical units"); check(read_reg(0x1e) == 41, "baseline");
    check(read_word(0) == 0, "initial release"); check(int_level() == 1, "IRQ pull");
    until(650); check(int_level() == 0, "touch IRQ"); check(read_word(0) == 1, "physical touch");
    check(int_level() == 1, "address clears IRQ"); check(read_word(4) == 99, "contact capacitance");
    until(850); check(read_word(0) == 1, "held touch");
    until(1050); check(int_level() == 0, "release IRQ"); check(read_word(0) == 0, "release");
    stop(); write_reg(0x1e, 100); start(0x41); check(read_reg(0x1e) == 100, "baseline lock");
    stop(); write_reg(0x5f, 32); write_reg(0x6c, 2); start(0xc1); check(read_word(4) == 661, "individual CDC CDT");
    stop(); write_reg(0x5f, 0); write_reg(0x6c, 0); write_reg(0x5c, 0); start(0xc1); check(read_word(4) == 0, "disabled current");
    stop(); write_reg(0x5c, 16); write_reg(0x5d, 0); start(0xc1); check(read_word(4) == 0, "disabled charge time");
    reset(); start(0xdc); check(read_word(0x1c) == 82, "two-electrode proximity");
    stop(); start(0xec); check(read_word(0x1c) == 41, "four-electrode proximity");
    stop(); start(0xfc); check(read_word(0x1c) == 13, "twelve-electrode proximity");
    reset(); write_reg(0x2b, 5); write_reg(0x2c, 1); write_reg(0x2d, 1); write_reg(0x41, 255); write_reg(0x42, 255); start(0xc1);
    until(1900); check(read_word(4) > 165, "physical drift"); check(read_reg(0x1e) >= 41, "baseline rising");
    stop(); write_reg(0x5b, 0x77); check(read_reg(0x5b) == 0x77, "max debounce");
    reset(); write_reg(0x5b, 0x77); write_reg(0x5c, 0xd0); write_reg(0x5d, 0xff); start(0xcf);
    check(read_word(4) == 0 && read_word(0x1a) == 0, "scan filter timing"); k_msleep(2500);
    check(read_word(4) == 1023 && read_word(0x1a) == 1023, "FFI SFI ESI and count 15");
    reset(); start(0xc1);
    until(6000); check((read_reg(1) & 0x80) != 0, "overcurrent"); check((read_reg(0x5e) & 63) == 0, "fault stops");
    check(read_word(4) == 0, "fault clears data"); write_reg(0x5e, 0xc1); check((read_reg(0x5e) & 63) == 0, "fault rejects run");
    until(6300); write_reg(1, 0x80); start(0xc1); check(read_word(4) == 165, "fault recovery");
    printk("failures %u\n", failures);
    return 0;
}
