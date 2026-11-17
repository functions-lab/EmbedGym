// Active buzzer unit test firmware (nRF52840 / Zephyr variant of code/code.ino).
//
// LOW until 500 ms, HIGH 500-2500 ms, LOW 2500-3000 ms, then a 100 ms HIGH pulse.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec buzzer = GPIO_DT_SPEC_GET(DT_ALIAS(buzzer), gpios);

int main(void)
{
    if (!gpio_is_ready_dt(&buzzer)) {
        return 1;
    }
    gpio_pin_configure_dt(&buzzer, GPIO_OUTPUT_INACTIVE);

    k_msleep(500);
    gpio_pin_set_dt(&buzzer, 1);
    k_msleep(2000);
    gpio_pin_set_dt(&buzzer, 0);
    k_msleep(500);
    gpio_pin_set_dt(&buzzer, 1);
    k_msleep(100);
    gpio_pin_set_dt(&buzzer, 0);
    return 0;
}
