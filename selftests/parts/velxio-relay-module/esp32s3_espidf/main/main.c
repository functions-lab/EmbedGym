// Relay module unit test firmware (ESP32-S3 variant of code/code.ino):
//   Toggle the relay's IN pin every second. The harness samples the element's
//   `energized` property mid-phase, so it must track the pin.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

#define RELAY_PIN GPIO_NUM_10

void app_main(void)
{
    gpio_reset_pin(RELAY_PIN);
    gpio_set_direction(RELAY_PIN, GPIO_MODE_OUTPUT);
    for (;;) {
        gpio_set_level(RELAY_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(1000));
        gpio_set_level(RELAY_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
