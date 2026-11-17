// L298N GPIO selftest (nRF52840 variant of code/code.ino): every 500 ms of
// uptime, bridge A takes the next state code and bridge B its complement
// (code bit 2 = enable, bit 1 = first input, bit 0 = second).
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec in1 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in1), gpios);
static const struct gpio_dt_spec in2 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in2), gpios);
static const struct gpio_dt_spec ena = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_ena), gpios);
static const struct gpio_dt_spec in3 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in3), gpios);
static const struct gpio_dt_spec in4 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in4), gpios);
static const struct gpio_dt_spec enb = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_enb), gpios);

static void bridge(const struct gpio_dt_spec *enable, const struct gpio_dt_spec *first,
                   const struct gpio_dt_spec *second, int code)
{
    gpio_pin_set_dt(enable, 0);
    gpio_pin_set_dt(first, (code & 2) ? 1 : 0);
    gpio_pin_set_dt(second, (code & 1) ? 1 : 0);
    gpio_pin_set_dt(enable, (code & 4) ? 1 : 0);
}

int main(void)
{
    const struct gpio_dt_spec *pins[] = {&in1, &in2, &ena, &in3, &in4, &enb};
    for (int i = 0; i < 6; i++) {
        gpio_pin_configure_dt(pins[i], GPIO_OUTPUT_INACTIVE);
    }
    for (int step = 0;; step++) {
        const int code = step % 8;
        bridge(&ena, &in1, &in2, code);
        bridge(&enb, &in3, &in4, 7 - code);
        k_sleep(K_TIMEOUT_ABS_MS(500 * (step + 1)));
    }
    return 0;
}
