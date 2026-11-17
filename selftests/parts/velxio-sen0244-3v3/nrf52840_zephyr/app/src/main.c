// SEN0244 selftest firmware for nrf52840_zephyr.
//
// Every 100 ms reads the signal on the overlay's io-channel (AIN1 = P0.03,
// gain 1/6, internal reference, 12-bit) and prints its millivolts and the TDS
// from DFRobot's 25 degC formula.
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/sys/printk.h>

static const struct adc_dt_spec tds_adc = ADC_DT_SPEC_GET(DT_PATH(zephyr_user));

int main(void)
{
    if (!adc_is_ready_dt(&tds_adc)) {
        printk("ADC not ready\n");
        return 1;
    }
    if (adc_channel_setup_dt(&tds_adc) < 0) {
        printk("ADC channel setup failed\n");
        return 1;
    }
    int16_t raw;
    struct adc_sequence seq = {
        .buffer = &raw,
        .buffer_size = sizeof(raw),
    };
    adc_sequence_init_dt(&tds_adc, &seq);
    for (;;) {
        if (adc_read_dt(&tds_adc, &seq) < 0) {
            printk("ADC read failed\n");
        } else {
            int32_t mv = raw;
            adc_raw_to_millivolts_dt(&tds_adc, &mv);
            if (mv < 0) {
                mv = 0;
            }
            float v = mv / 1000.0f;
            float tds = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * 0.5f;
            printk("mV: %d TDS: %d\n", (int)mv, (int)(tds + 0.5f));
        }
        k_msleep(100);
    }
    return 0;
}
