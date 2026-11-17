// KY-008 unit test firmware (ESP32-S3 variant of code/code.ino):
//   Toggle the laser's signal pin every second. The harness samples the
//   element's `laserOn` property mid-phase, so it must track the pin.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

#define LASER_PIN GPIO_NUM_10

void app_main(void)
{
    gpio_reset_pin(LASER_PIN);
    gpio_set_direction(LASER_PIN, GPIO_MODE_OUTPUT);
    for (;;) {
        gpio_set_level(LASER_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(1000));
        gpio_set_level(LASER_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
