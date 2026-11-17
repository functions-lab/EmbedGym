// Relay module unit test firmware (nRF52840 / Zephyr variant of code/code.ino).
//
// Toggle the relay's IN pin every second. The harness samples the element's
// `energized` property mid-phase, so it must track the pin.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec relay = GPIO_DT_SPEC_GET(DT_ALIAS(relay), gpios);

int main(void)
{
    if (!gpio_is_ready_dt(&relay)) {
        return 1;
    }
    gpio_pin_configure_dt(&relay, GPIO_OUTPUT_INACTIVE);

    for (;;) {
        gpio_pin_set_dt(&relay, 1);
        k_msleep(1000);
        gpio_pin_set_dt(&relay, 0);
        k_msleep(1000);
    }
    return 0;
}
