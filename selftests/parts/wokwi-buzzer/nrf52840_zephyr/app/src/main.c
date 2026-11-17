// Buzzer unit test firmware (nRF52840 / Zephyr variant of code/code.ino):
//   t = 0      tone ON  at 1 kHz on P1.15
//   t = 1000   tone OFF
//   t = 2000   tone ON  at 2 kHz
//   t = 3000   tone OFF
//   t = 4000   4 slow beeps (500 ms period), then 16 fast ones (125 ms period)
// The buzzer is a plain GPIO, so a tone is the pin toggled every half period.
// TIMER1 alarms pace the toggles: a kernel timer's 32768 Hz tick cannot hit
// 1 kHz, and Renode's TIMER has no SHORTS, so a counter top value never reloads.
#include <zephyr/kernel.h>
#include <zephyr/drivers/counter.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec buzzer = GPIO_DT_SPEC_GET(DT_ALIAS(my_buzzer), gpios);
static const struct device *const tone_timer = DEVICE_DT_GET(DT_NODELABEL(timer1));

static struct counter_alarm_cfg half_period;

// Each alarm is set one half period after the previous one's compare value,
// so the toggle spacing is exact whatever the interrupt latency.
static void on_half_period(const struct device *dev, uint8_t chan_id, uint32_t ticks, void *user_data)
{
    uint32_t interval = (uint32_t)(uintptr_t)user_data;

    gpio_pin_toggle_dt(&buzzer);
    half_period.ticks = ticks + interval;
    counter_set_channel_alarm(dev, chan_id, &half_period);
}

static void tone_on(uint32_t hz)
{
    uint32_t interval = counter_us_to_ticks(tone_timer, 500000U / hz);
    uint32_t now;

    counter_start(tone_timer);
    counter_get_value(tone_timer, &now);
    half_period.flags = COUNTER_ALARM_CFG_ABSOLUTE;
    half_period.callback = on_half_period;
    half_period.user_data = (void *)(uintptr_t)interval;
    half_period.ticks = now + interval;
    counter_set_channel_alarm(tone_timer, 0, &half_period);
}

static void tone_off(void)
{
    counter_cancel_channel_alarm(tone_timer, 0);
    counter_stop(tone_timer);
    gpio_pin_set_dt(&buzzer, 0);
}

static void beep(uint32_t hz, int64_t from_ms, int64_t on_ms, int64_t period_ms)
{
    tone_on(hz);
    k_sleep(K_TIMEOUT_ABS_MS(from_ms + on_ms));
    tone_off();
    k_sleep(K_TIMEOUT_ABS_MS(from_ms + period_ms));
}

int main(void)
{
    if (!gpio_is_ready_dt(&buzzer) || !device_is_ready(tone_timer)) {
        printk("Buzzer not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&buzzer, GPIO_OUTPUT_INACTIVE);

    beep(1000, 0, 1000, 2000);
    beep(2000, 2000, 1000, 2000);

    int64_t t = 4000;
    for (int i = 0; i < 4; i++, t += 500) {
        beep(1500, t, 100, 500);
    }
    for (int i = 0; i < 16; i++, t += 125) {
        beep(1500, t, 50, 125);
    }
    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
