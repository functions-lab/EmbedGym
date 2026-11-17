// Water level sensor unit test firmware (ESP32-S3 variant of code/code.ino):
//   Read the signal pin every 100 ms and print a coarse level bucket. The
//   harness pokes `set sensor.level`, so the printed bucket must follow.
//   The part maps level linearly onto 0 V ... 3.3 V; the 12-bit raw value is
//   scaled to the AVR sketch's 10-bit buckets so the serial output matches.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#include <stdio.h>

#define LEVEL_CHANNEL ADC1_CHANNEL_3   // GPIO4

void app_main(void)
{
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(LEVEL_CHANNEL, ADC_ATTEN_DB_11);

    for (;;) {
        int adc = adc1_get_raw(LEVEL_CHANNEL) >> 2;

        printf("Level: ");
        if (adc <= 200) {
            printf("LOW\n");
        } else if (adc <= 800) {
            printf("MID\n");
        } else if (adc <= 1023) {
            printf("HIGH\n");
        } else {
            printf("ERR\n");
        }
        fflush(stdout);

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
