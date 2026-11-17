// Pushbutton unit test firmware (ESP32-S3 variant of code/code.ino).
//
// The button is wired pull-down: GPIO12 idles at GND through R_PD and is tied
// to 3V3 while the button is held, so a press reads HIGH. Plain GPIO_MODE_INPUT
// with no internal pull — the level comes from the solved circuit. We poll the
// pin and print a line on each press / release edge so the test can assert via
// serial, alongside the element's own `pressed` property.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include <stdio.h>

#define BUTTON_PIN GPIO_NUM_12

void app_main(void)
{
    gpio_reset_pin(BUTTON_PIN);
    gpio_set_direction(BUTTON_PIN, GPIO_MODE_INPUT);

    int last_state = 0;
    for (;;) {
        int state = gpio_get_level(BUTTON_PIN);
        if (state != last_state) {
            if (state) printf("Button Pressed!\n");
            else printf("Button Released!\n");
            fflush(stdout);
            last_state = state;
        }
        vTaskDelay(1);
    }
}
