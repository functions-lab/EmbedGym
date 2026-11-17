// L298N jumper selftest (ESP32-S3 variant of code/code.ino): IN1 and IN3
// HIGH, IN2 and IN4 LOW; ENA/ENB come from the jumpers or the pull-downs.
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void app_main(void)
{
    const gpio_num_t pins[] = {GPIO_NUM_4, GPIO_NUM_5, GPIO_NUM_7, GPIO_NUM_15};
    const int levels[] = {1, 0, 1, 0};
    for (int i = 0; i < 4; i++) {
        gpio_reset_pin(pins[i]);
        gpio_set_direction(pins[i], GPIO_MODE_OUTPUT);
        gpio_set_level(pins[i], levels[i]);
    }
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
