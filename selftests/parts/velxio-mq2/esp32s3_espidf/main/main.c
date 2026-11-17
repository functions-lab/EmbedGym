// MQ-2 unit test firmware (ESP32-S3 variant of code/code.ino):
//   Prints the AO pin voltage in mV and the DO level every 100 ms, and each
//   DO change as it happens (polled every 1 ms). The harness sets `voltage`
//   and `threshold` across each other, so both outputs must follow.
//   AO arrives through a 100k/150k divider; DO through a level shifter, so
//   the pin is a plain input with no pull.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#include "driver/gpio.h"
#include <stdio.h>

#define AO_CHANNEL ADC1_CHANNEL_3   // GPIO4
#define DO_PIN GPIO_NUM_5

void app_main(void)
{
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(AO_CHANNEL, ADC_ATTEN_DB_11);

    gpio_reset_pin(DO_PIN);
    gpio_set_direction(DO_PIN, GPIO_MODE_INPUT);

    int last_do = gpio_get_level(DO_PIN);
    printf("DO start: %d\n", last_do);
    fflush(stdout);

    TickType_t last_report = 0;
    for (;;) {
        TickType_t now = xTaskGetTickCount();
        int level = gpio_get_level(DO_PIN);
        if (level != last_do) {
            last_do = level;
            printf("DO edge: %d\n", level);
            fflush(stdout);
        }
        if (now - last_report >= pdMS_TO_TICKS(100)) {
            last_report = now;
            long mv = (long)adc1_get_raw(AO_CHANNEL) * 3300 / 4095;
            printf("AO: %ld DO: %d\n", mv, level);
            fflush(stdout);
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}
