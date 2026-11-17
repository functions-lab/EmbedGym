// MPR121 unpowered selftest for nrf52840_zephyr (port of the AVR sketch):
// raw I2C on i2c0; every address, a write and a read must be NACKed.
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec int_pin = GPIO_DT_SPEC_GET(DT_ALIAS(mpr121_int), gpios);

int main(void)
{
    gpio_pin_configure_dt(&int_pin, GPIO_INPUT);
    unsigned failures = 0;
    for (uint8_t address = 0x5a; address <= 0x5d; address++) if (i2c_write(i2c, NULL, 0, address) == 0) failures++;
    uint8_t reset[2] = {0x80, 0x63};
    if (i2c_write(i2c, reset, 2, 0x5a) == 0) failures++;
    uint8_t data;
    if (i2c_read(i2c, &data, 1, 0x5a) == 0) failures++;
    printk("failures %u\n", failures);
    return 0;
}
