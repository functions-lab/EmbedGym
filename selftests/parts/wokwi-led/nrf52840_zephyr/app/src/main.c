// LED unit test firmware (nRF52840 / Zephyr variant of code/code.ino):
//   Digital phase: blink P1.15; `value` tracks the pin through the resistor.
//   PWM phase: PWM at half duty -> `brightness` reports the duty;
//   full duty -> brightness must read 1; zero duty -> off.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(my_led), gpios);
static const struct pwm_dt_spec pwm_led = PWM_DT_SPEC_GET(DT_ALIAS(pwm_led0));

int main(void)
{
    if (!gpio_is_ready_dt(&led) || !pwm_is_ready_dt(&pwm_led)) {
        printk("LED not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
    k_msleep(1000);
    gpio_pin_set_dt(&led, 0);
    k_msleep(1000);
    gpio_pin_set_dt(&led, 1);
    k_msleep(1000);
    gpio_pin_set_dt(&led, 0);
    k_msleep(1000);

    pwm_set_pulse_dt(&pwm_led, pwm_led.period / 2);
    k_msleep(1000);
    pwm_set_pulse_dt(&pwm_led, pwm_led.period);
    k_msleep(1000);
    pwm_set_pulse_dt(&pwm_led, 0);
    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
