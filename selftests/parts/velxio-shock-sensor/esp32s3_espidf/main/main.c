// Shock sensor unit test firmware (ESP32-S3 variant of code/code.ino).
//
// `set shock.shock = true` fires one 50 ms HIGH pulse on the signal pin,
// timed on the worker's virtual clock. Count rising edges, print the running
// count, and print each pulse's width on its falling edge.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include <stdio.h>

#define SHOCK_PIN GPIO_NUM_14

void app_main(void)
{
    gpio_reset_pin(SHOCK_PIN);
    gpio_set_direction(SHOCK_PIN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(SHOCK_PIN, GPIO_FLOATING);

    int last_state = 0;
    int shocks = 0;
    int64_t rise_us = 0;
    for (;;) {
        int state = gpio_get_level(SHOCK_PIN);
        if (state && !last_state) {
            shocks++;
            rise_us = esp_timer_get_time();
            printf("Shocks: %d\n", shocks);
            fflush(stdout);
        } else if (!state && last_state) {
            printf("Pulse: %d ms\n", (int)((esp_timer_get_time() - rise_us) / 1000));
            fflush(stdout);
        }
        last_state = state;
        vTaskDelay(1);
    }
}
