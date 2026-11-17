// KY-018 selftest firmware for nrf52840_zephyr.
//
// Reads S through Zephyr's ADC API on the overlay's io-channel (AIN2 = P0.04,
// gain 1/6, internal reference, 12-bit) every 100 ms and prints a coarse light
// bucket. The module is powered from VDD, so S spans 0 V … 3.3 V: the reading
// is scaled to a 0–1023 fraction of that rail and bucketed like the AVR sketch
// (brighter light -> lower voltage on S).
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/sys/printk.h>

#define RAIL_MV 3300

static const struct adc_dt_spec ky018 = ADC_DT_SPEC_GET(DT_PATH(zephyr_user));

int main(void)
{
    if (!adc_is_ready_dt(&ky018)) {
        printk("ADC not ready\n");
        return 1;
    }
    if (adc_channel_setup_dt(&ky018) < 0) {
        printk("ADC channel setup failed\n");
        return 1;
    }
    int16_t raw;
    struct adc_sequence seq = {
        .buffer = &raw,
        .buffer_size = sizeof(raw),
    };
    adc_sequence_init_dt(&ky018, &seq);
    for (;;) {
        if (adc_read_dt(&ky018, &seq) < 0) {
            printk("ADC read failed\n");
        } else {
            int32_t mv = raw;
            adc_raw_to_millivolts_dt(&ky018, &mv);
            int32_t fraction = mv * 1023 / RAIL_MV;
            if (fraction <= 200) {
                printk("Light: BRIGHT\n");
            } else if (fraction <= 800) {
                printk("Light: MID\n");
            } else {
                printk("Light: DARK\n");
            }
        }
        k_msleep(100);
    }
    return 0;
}
