// KY-008 unit test firmware (nRF52840 / Zephyr variant of code/code.ino).
//
// Toggle the laser's signal pin every second. The harness samples the
// element's `laserOn` property mid-phase, so it must track the pin.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec emitter = GPIO_DT_SPEC_GET(DT_ALIAS(emitter), gpios);

int main(void)
{
    if (!gpio_is_ready_dt(&emitter)) {
        return 1;
    }
    gpio_pin_configure_dt(&emitter, GPIO_OUTPUT_INACTIVE);

    for (;;) {
        gpio_pin_set_dt(&emitter, 1);
        k_msleep(1000);
        gpio_pin_set_dt(&emitter, 0);
        k_msleep(1000);
    }
    return 0;
}
