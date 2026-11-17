// SEN0244 unit test firmware (ESP32-S3 variant of code/code.ino):
//   Every 100 ms prints the signal pin's voltage and the TDS it converts to
//   with DFRobot's 25 °C formula. The harness steps `tds` across the range.
//   The 3.3 V-supply variant expects the same readings: the output is not
//   ratiometric to the supply.
//
// The conversion assumes a linear 12-bit ADC with a 3.3 V full scale:
//   mV = raw * 3300 / 4095, rounded.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#include <stdio.h>

#define TDS_CHANNEL ADC1_CHANNEL_8   // GPIO9

void app_main(void)
{
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(TDS_CHANNEL, ADC_ATTEN_DB_11);

    for (;;) {
        int raw = adc1_get_raw(TDS_CHANNEL);
        int mv = (raw * 3300 + 2047) / 4095;
        float v = mv / 1000.0f;
        float tds = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * 0.5f;

        printf("mV: %d TDS: %d\n", mv, (int)(tds + 0.5f));
        fflush(stdout);

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
