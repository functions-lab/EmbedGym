// Checks that k_busy_wait(N) takes N µs of virtual time. nrfx paces it with an
// instruction-counting loop, so its length follows the emulator's instruction
// rate, not a timer. Each wait sits between an "s" and an "e" line, whose
// stamps the paired test subtracts; the LED is high across a last 40 ms wait:
//
//   t≈10   20 µs      t≈20   100 µs     t≈30   500 µs
//   t≈40   5 ms       t≈55   50 ms
//   t≈116  LED on, 40 ms busy-wait, LED off at t≈156
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(my_led), gpios);
static const uint32_t waits_us[] = {20, 100, 500, 5000, 50000};

int main(void)
{
    gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);

    for (size_t i = 0; i < ARRAY_SIZE(waits_us); i++) {
        k_msleep(10);
        printk("s\n");
        k_busy_wait(waits_us[i]);
        printk("e\n");
    }

    k_msleep(10);
    gpio_pin_set_dt(&led, 1);
    k_busy_wait(40000);
    gpio_pin_set_dt(&led, 0);

    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
