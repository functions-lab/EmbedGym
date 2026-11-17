// KY-020 tilt switch unit test firmware (ESP32-S3 variant of code/code.ino).
//
// `set tilt.tilted = true|false` sets the state absolutely: tilted drives S
// HIGH, upright drives it LOW. Print each edge so the test can assert both
// directions.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include <stdio.h>

#define TILT_PIN GPIO_NUM_14

void app_main(void)
{
    gpio_reset_pin(TILT_PIN);
    gpio_set_direction(TILT_PIN, GPIO_MODE_INPUT);

    int last_state = gpio_get_level(TILT_PIN);
    for (;;) {
        int state = gpio_get_level(TILT_PIN);
        if (state != last_state) {
            if (state) printf("Tilted\n");
            else printf("Upright\n");
            fflush(stdout);
            last_state = state;
        }
        vTaskDelay(1);
    }
}
