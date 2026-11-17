// KY-020 tilt switch unit test firmware (nRF52840 / Zephyr variant of code/code.ino).
//
// `set tilt.tilted = true|false` sets the state absolutely: tilted drives S
// HIGH, upright drives it LOW. Print each edge so the test can assert both
// directions.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec sensor = GPIO_DT_SPEC_GET(DT_ALIAS(ky020), gpios);

int main(void)
{
    if (!gpio_is_ready_dt(&sensor)) {
        printk("Sensor GPIO not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&sensor, GPIO_INPUT);

    int last = gpio_pin_get_dt(&sensor);
    for (;;) {
        int state = gpio_pin_get_dt(&sensor);
        if (state != last) {
            printk(state ? "Tilted\n" : "Upright\n");
            last = state;
        }
        k_msleep(1);
    }
    return 0;
}
