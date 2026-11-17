// Shock sensor unit test firmware (nRF52840 / Zephyr variant of code/code.ino).
//
// Count rising edges on the signal pin (each `set shock = true` fires one
// 50 ms HIGH pulse), print the running count, and print each pulse's width on
// its falling edge.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec sensor = GPIO_DT_SPEC_GET(DT_ALIAS(shock_sensor), gpios);

int main(void)
{
    if (!gpio_is_ready_dt(&sensor)) {
        printk("Sensor GPIO not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&sensor, GPIO_INPUT);

    int last = 0;
    int shocks = 0;
    int64_t rise_ms = 0;
    for (;;) {
        int state = gpio_pin_get_dt(&sensor);
        if (state && !last) {
            shocks++;
            rise_ms = k_uptime_get();
            printk("Shocks: %d\n", shocks);
        } else if (!state && last) {
            printk("Pulse: %d ms\n", (int)(k_uptime_get() - rise_ms));
        }
        last = state;
        k_msleep(1);
    }
    return 0;
}
