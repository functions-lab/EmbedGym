// MAX17048 battery-power selftest for nrf52840_zephyr (port of the AVR
// sketch): raw I2C on i2c0, INT on the max17048-int alias. Times count from
// reset.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x36

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec alert = GPIO_DT_SPEC_GET(DT_ALIAS(max17048_int), gpios);

static uint16_t failures = 0;

static void check(bool ok, const char *name)
{
    if (!ok) {
        failures++;
        printk("FAIL %s\n", name);
    }
}

static int probe(void) { return i2c_write(i2c, NULL, 0, ADDR); }

int main(void)
{
    gpio_pin_configure_dt(&alert, GPIO_INPUT);
    check(probe() == -EIO, "no-battery-nack");
    check(gpio_pin_get_dt(&alert) == 1, "unpowered-int-released");
    printk("unpowered %u\n", failures);
    while (k_uptime_get() < 1500) k_msleep(1);
    check(probe() == 0, "battery-insertion-ack");
    check(gpio_pin_get_dt(&alert) == 1, "powered-int-released");
    uint8_t reg = 0x04;
    uint8_t data[2] = {0, 0};
    check(i2c_write_read(i2c, ADDR, &reg, 1, data, 2) == 0, "soc-read");
    check((((uint16_t)data[0] << 8) | data[1]) == 50 * 256, "soc-ready");
    printk("failures %u\n", failures);
    return 0;
}
