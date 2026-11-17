// Active buzzer unit test firmware (ESP32-S3 variant of code/code.ino):
//   LOW until 500 ms, HIGH 500-2500 ms, LOW until 3000 ms, then a 100 ms
//   HIGH pulse. An active buzzer sounds for the whole DC level.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

#define BUZZER_PIN GPIO_NUM_10

void app_main(void)
{
    gpio_reset_pin(BUZZER_PIN);
    gpio_set_direction(BUZZER_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(BUZZER_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(500));
    gpio_set_level(BUZZER_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(2000));
    gpio_set_level(BUZZER_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(500));
    gpio_set_level(BUZZER_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(100));
    gpio_set_level(BUZZER_PIN, 0);
}
