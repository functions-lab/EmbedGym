// Line sensor unit test firmware (ESP32-S3 variant of code/code.ino): the 5 V
// sensor's L/M/R reach GPIO12..14 through level-shifter channels. GPIO13 keeps
// its internal pull-up, which the shifter's 10 kΩ LV pull-up dominates.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include <stdio.h>

void app_main(void)
{
    const gpio_num_t pins[] = { GPIO_NUM_12, GPIO_NUM_13, GPIO_NUM_14 };
    for (int i = 0; i < 3; i++) {
        gpio_reset_pin(pins[i]);
        gpio_set_direction(pins[i], GPIO_MODE_INPUT);
        gpio_set_pull_mode(pins[i], pins[i] == GPIO_NUM_13 ? GPIO_PULLUP_ONLY : GPIO_FLOATING);
    }
    for (;;) {
        printf("Bits %d%d%d\n", gpio_get_level(pins[0]), gpio_get_level(pins[1]), gpio_get_level(pins[2]));
        fflush(stdout);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
