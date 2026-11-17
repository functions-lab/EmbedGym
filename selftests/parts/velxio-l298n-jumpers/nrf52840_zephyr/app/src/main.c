// L298N jumper selftest (nRF52840 variant of code/code.ino): IN1 and IN3
// HIGH, IN2 and IN4 LOW; ENA/ENB come from the jumpers or the pull-downs.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec in1 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in1), gpios);
static const struct gpio_dt_spec in2 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in2), gpios);
static const struct gpio_dt_spec in3 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in3), gpios);
static const struct gpio_dt_spec in4 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in4), gpios);

int main(void)
{
    gpio_pin_configure_dt(&in1, GPIO_OUTPUT_ACTIVE);
    gpio_pin_configure_dt(&in2, GPIO_OUTPUT_INACTIVE);
    gpio_pin_configure_dt(&in3, GPIO_OUTPUT_ACTIVE);
    gpio_pin_configure_dt(&in4, GPIO_OUTPUT_INACTIVE);
    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
