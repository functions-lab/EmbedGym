// Checks that `at` and serial stamps are measured from reset: Zephyr's
// k_uptime_get() is 0 at reset and main() starts ~0.3 ms later, so a t0 read
// at the top of main must print as 0 or 1 ms, and edges placed at fixed
// uptimes must land where the test samples them (5 ms either side):
//
//   t=0    reset, LED off, prints "t0=<ms>"
//   t=10   LED on
//   t=20   LED off
//   t=40   LED on
//   t=80   LED off, and stays off
//
// The banner Zephyr prints before main is stamped at t=0 too, so it is visible
// to `parse`; the paired test asserts that as well.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(my_led), gpios);
static int64_t t0;

static void set_at_ms(int64_t target_ms, int level)
{
    k_msleep((int32_t)(t0 + target_ms - k_uptime_get()));
    gpio_pin_set_dt(&led, level);
}

int main(void)
{
    t0 = k_uptime_get();
    gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
    printk("t0=%lld\n", t0);

    set_at_ms(10, 1);
    set_at_ms(20, 0);
    set_at_ms(40, 1);
    set_at_ms(80, 0);

    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
