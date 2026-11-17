// Joystick unit test firmware (ESP32-S3 variant of code/code.ino):
//   Print coarse buckets for both axes plus the switch state every 100 ms.
//   The harness pokes `set joy.x/y/pressed`, so the output must follow.
//   Axes idle at 512 (VCC/2); SW is active-low and driven by the module, so
//   the pin is a plain input with no pull.
//
// The 12-bit raw value is scaled to the AVR sketch's 10-bit buckets so the
// serial output matches.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#include "driver/gpio.h"
#include <stdio.h>

#define VRX_CHANNEL ADC1_CHANNEL_3   // GPIO4
#define VRY_CHANNEL ADC1_CHANNEL_4   // GPIO5
#define SW_PIN GPIO_NUM_14

static const char *bucket(int adc)
{
    if (adc <= 200) return "LOW";
    if (adc <= 800) return "MID";
    return "HIGH";
}

void app_main(void)
{
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(VRX_CHANNEL, ADC_ATTEN_DB_11);
    adc1_config_channel_atten(VRY_CHANNEL, ADC_ATTEN_DB_11);
    gpio_reset_pin(SW_PIN);
    gpio_set_direction(SW_PIN, GPIO_MODE_INPUT);

    for (;;) {
        int x = adc1_get_raw(VRX_CHANNEL) >> 2;
        int y = adc1_get_raw(VRY_CHANNEL) >> 2;
        printf("X: %s Y: %s SW: %s\n", bucket(x), bucket(y),
               gpio_get_level(SW_PIN) == 0 ? "PRESSED" : "RELEASED");
        fflush(stdout);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
