// Zephyr port of the sampling-grain probe (see the AVR variant's code.ino).
// The pin level is a pure function of uptime, toggling every 10 ms; the shared
// test samples mid-plateau on alternating plateaus, so a driver that lands
// checks on frame boundaries instead of parking at each `at` reads the wrong
// plateau. k_uptime_get() is 0 at reset, which is the harness's t=0 on this
// target, so no t0 capture is needed.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(my_led), gpios);

int main(void)
{
    gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);

    int level = 0;
    for (;;) {
        int want = (int)((k_uptime_get() / 10) % 2);
        if (want != level) {
            level = want;
            gpio_pin_set_dt(&led, level);
        }
        k_msleep(1);
    }
    return 0;
}
