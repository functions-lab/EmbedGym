// ADC calibration probe firmware (see ../adc_cal_probe.py).
//
// Blind solves on analog tasks call esp_adc_cal_characterize() and
// esp_adc_cal_raw_to_voltage() without checking the return, as they may on
// silicon, where the factory burns the calibration eFuses. A QEMU S3 with a
// zeroed eFuse block makes the first call fail (BLK_VERSION_MAJOR = 0) and
// the second return 0 mV from every reading. The worker now hands QEMU an
// eFuse image carrying the calibration block; this firmware reports what the
// IDF v4.4 calibration API sees and converts one channel through it.
#include <stdio.h>
#include "driver/adc.h"
#include "esp_adc_cal.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define PROBE_CHANNEL ADC1_CHANNEL_8   // GPIO9

void app_main(void)
{
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(PROBE_CHANNEL, ADC_ATTEN_DB_11);

    esp_err_t check = esp_adc_cal_check_efuse(ESP_ADC_CAL_VAL_EFUSE_TP_FIT);
    esp_adc_cal_characteristics_t chars;
    esp_adc_cal_value_t kind = esp_adc_cal_characterize(
        ADC_UNIT_1, ADC_ATTEN_DB_11, ADC_WIDTH_BIT_12, 0, &chars);
    printf("GYMCAL check=%d kind=%d coeff_a=%u\n", (int)check, (int)kind,
           (unsigned)chars.coeff_a);

    for (;;) {
        int raw = adc1_get_raw(PROBE_CHANNEL);
        printf("GYMADC %d %u\n", raw, (unsigned)esp_adc_cal_raw_to_voltage(raw, &chars));
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
