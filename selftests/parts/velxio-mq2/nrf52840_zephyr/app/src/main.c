// MQ-2 selftest firmware for nrf52840_zephyr.
//
// Prints the AO voltage at P0.03 (AIN1, after the 100k/150k divider) in
// millivolts and the DO level (P1.10) every 100 ms, and each DO change as it
// happens (polled every 1 ms).
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct adc_dt_spec ao = ADC_DT_SPEC_GET(DT_PATH(zephyr_user));
static const struct gpio_dt_spec dout = GPIO_DT_SPEC_GET(DT_PATH(zephyr_user), do_gpios);

static int read_ao_mv(void)
{
    int16_t raw;
    struct adc_sequence seq = {
        .buffer = &raw,
        .buffer_size = sizeof(raw),
    };
    adc_sequence_init_dt(&ao, &seq);
    if (adc_read_dt(&ao, &seq) < 0) {
        printk("ADC read failed\n");
        return -1;
    }
    int32_t mv = raw;
    adc_raw_to_millivolts_dt(&ao, &mv);
    return mv;
}

int main(void)
{
    if (!adc_is_ready_dt(&ao) || !gpio_is_ready_dt(&dout)) {
        printk("devices not ready\n");
        return 1;
    }
    if (adc_channel_setup_dt(&ao) < 0) {
        printk("ADC channel setup failed\n");
        return 1;
    }
    gpio_pin_configure_dt(&dout, GPIO_INPUT);

    int last_do = gpio_pin_get_dt(&dout);
    printk("DO start: %d\n", last_do);
    int64_t last_report_ms = 0;

    for (;;) {
        int64_t now = k_uptime_get();
        int level = gpio_pin_get_dt(&dout);
        if (level != last_do) {
            last_do = level;
            printk("DO edge: %d\n", level);
        }
        if (now - last_report_ms >= 100) {
            last_report_ms = now;
            printk("AO: %d DO: %d\n", read_ao_mv(), level);
        }
        k_msleep(1);
    }
    return 0;
}
