// PWM-driven buzzer unit test firmware: the tone is &pwm0's own waveform, so
// the pin reports no edges and the pitch is the PWM period.
//   t = 0      1000 Hz  (PRESCALER 0, COUNTERTOP 16000)
//   t = 1000   pulse 0: silence
//   t = 2000   375 Hz   (PRESCALER 1, COUNTERTOP 21333: the period needs 16 bits)
//   t = 3000   1600 Hz, same 50 % duty, no silence in between
//   t = 4000   pulse 0: silence
#include <zephyr/kernel.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/sys/printk.h>

static const struct pwm_dt_spec buzzer = PWM_DT_SPEC_GET(DT_ALIAS(my_buzzer));

static void tone(uint32_t hz)
{
    uint32_t period = PWM_HZ(hz);

    pwm_set_dt(&buzzer, period, period / 2);
}

int main(void)
{
    if (!pwm_is_ready_dt(&buzzer)) {
        printk("Buzzer not ready\n");
        return 1;
    }

    tone(1000);
    k_sleep(K_TIMEOUT_ABS_MS(1000));
    pwm_set_pulse_dt(&buzzer, 0);
    k_sleep(K_TIMEOUT_ABS_MS(2000));
    tone(375);
    k_sleep(K_TIMEOUT_ABS_MS(3000));
    tone(1600);
    k_sleep(K_TIMEOUT_ABS_MS(4000));
    pwm_set_pulse_dt(&buzzer, 0);
    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
