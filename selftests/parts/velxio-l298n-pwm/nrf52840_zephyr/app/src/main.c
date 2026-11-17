// L298N PWM selftest (nRF52840 variant of code/code.ino). Stages of 600 ms of
// uptime; IN1/IN3 HIGH, IN2/IN4 LOW unless noted. ENA/ENB are &pwm0 channels,
// which share one period:
//   0  ENA 0 %, ENB 100 %
//   1  ENA 25 %, ENB 75 % (1 ms period)
//   2  ENB 100 %, ENA 25 % (500 us period)
//   3  ENA 75 % (500 us period)
//   4  ENA 30 %, ENB 70 % (2 ms period)
//   5  ENA/ENB 100 %; IN1/IN2 complementary and IN3 GPIO software PWM 40 %
//   6  IN1 LOW, IN2 HIGH, ENA 100 %, ENB 0 %
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/pwm.h>

static const struct gpio_dt_spec in1 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in1), gpios);
static const struct gpio_dt_spec in2 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in2), gpios);
static const struct gpio_dt_spec in3 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in3), gpios);
static const struct gpio_dt_spec in4 = GPIO_DT_SPEC_GET(DT_ALIAS(l298n_in4), gpios);
static const struct pwm_dt_spec ena = PWM_DT_SPEC_GET(DT_ALIAS(l298n_ena));
static const struct pwm_dt_spec enb = PWM_DT_SPEC_GET(DT_ALIAS(l298n_enb));

static void pwm(const struct pwm_dt_spec *spec, uint32_t period_us, uint32_t percent)
{
    int err = pwm_set_dt(spec, PWM_USEC(period_us), PWM_USEC(period_us) / 100 * percent);
    if (err) {
        printk("pwm_set_dt failed: %d\n", err);
    }
}

int main(void)
{
    gpio_pin_configure_dt(&in1, GPIO_OUTPUT_ACTIVE);
    gpio_pin_configure_dt(&in2, GPIO_OUTPUT_INACTIVE);
    gpio_pin_configure_dt(&in3, GPIO_OUTPUT_ACTIVE);
    gpio_pin_configure_dt(&in4, GPIO_OUTPUT_INACTIVE);
    pwm(&ena, 1000, 0);
    pwm(&enb, 1000, 100);

    k_sleep(K_TIMEOUT_ABS_MS(600));
    pwm(&ena, 1000, 25);
    pwm(&enb, 1000, 75);

    k_sleep(K_TIMEOUT_ABS_MS(1200));
    pwm(&enb, 1000, 100);
    pwm(&ena, 500, 25);

    k_sleep(K_TIMEOUT_ABS_MS(1800));
    pwm(&ena, 500, 75);

    k_sleep(K_TIMEOUT_ABS_MS(2400));
    pwm(&ena, 2000, 30);
    pwm(&enb, 2000, 70);

    k_sleep(K_TIMEOUT_ABS_MS(3000));
    pwm(&ena, 2000, 100);
    pwm(&enb, 2000, 100);
    while (k_uptime_get() < 3600) {
        gpio_pin_set_dt(&in1, 1);
        gpio_pin_set_dt(&in2, 0);
        gpio_pin_set_dt(&in3, 1);
        k_busy_wait(800);
        gpio_pin_set_dt(&in1, 0);
        gpio_pin_set_dt(&in2, 1);
        gpio_pin_set_dt(&in3, 0);
        k_busy_wait(1200);
    }

    gpio_pin_set_dt(&in1, 0);
    gpio_pin_set_dt(&in2, 1);
    gpio_pin_set_dt(&in3, 1);
    pwm(&ena, 2000, 100);
    pwm(&enb, 2000, 0);
    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
