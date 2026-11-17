// Water level sensor selftest firmware for nrf52840_zephyr.
//
// Reads signal through Zephyr's ADC API on the overlay's io-channel (AIN1 =
// P0.03, gain 1/6, internal reference, 12-bit) every 100 ms and prints a
// coarse level bucket. The sensor is powered from VDD, so signal spans
// 0 V … 3.3 V: the reading is scaled to a 0–1023 fraction of that rail and
// bucketed like the AVR sketch.
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/sys/printk.h>

#define RAIL_MV 3300

static const struct adc_dt_spec sensor = ADC_DT_SPEC_GET(DT_PATH(zephyr_user));

int main(void)
{
    if (!adc_is_ready_dt(&sensor)) {
        printk("ADC not ready\n");
        return 1;
    }
    if (adc_channel_setup_dt(&sensor) < 0) {
        printk("ADC channel setup failed\n");
        return 1;
    }
    int16_t raw;
    struct adc_sequence seq = {
        .buffer = &raw,
        .buffer_size = sizeof(raw),
    };
    adc_sequence_init_dt(&sensor, &seq);
    for (;;) {
        if (adc_read_dt(&sensor, &seq) < 0) {
            printk("ADC read failed\n");
        } else {
            int32_t mv = raw;
            adc_raw_to_millivolts_dt(&sensor, &mv);
            int32_t fraction = mv * 1023 / RAIL_MV;
            if (fraction <= 200) {
                printk("Level: LOW\n");
            } else if (fraction <= 800) {
                printk("Level: MID\n");
            } else {
                printk("Level: HIGH\n");
            }
        }
        k_msleep(100);
    }
    return 0;
}
