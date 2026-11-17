// L298N GPIO selftest (ESP32-S3 variant of code/code.ino): every 500 ms from
// app_main entry, bridge A takes the next state code and bridge B its
// complement (code bit 2 = enable, bit 1 = first input, bit 0 = second).
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define IN1 GPIO_NUM_4
#define IN2 GPIO_NUM_5
#define ENA GPIO_NUM_6
#define IN3 GPIO_NUM_7
#define IN4 GPIO_NUM_15
#define ENB GPIO_NUM_16

static void bridge(gpio_num_t enable, gpio_num_t first, gpio_num_t second, int code)
{
    gpio_set_level(enable, 0);
    gpio_set_level(first, (code & 2) ? 1 : 0);
    gpio_set_level(second, (code & 1) ? 1 : 0);
    gpio_set_level(enable, (code & 4) ? 1 : 0);
}

void app_main(void)
{
    TickType_t start = xTaskGetTickCount();
    const gpio_num_t pins[] = {IN1, IN2, ENA, IN3, IN4, ENB};
    for (int i = 0; i < 6; i++) {
        gpio_reset_pin(pins[i]);
        gpio_set_direction(pins[i], GPIO_MODE_OUTPUT);
    }
    for (int code = 0;; code = (code + 1) % 8) {
        bridge(ENA, IN1, IN2, code);
        bridge(ENB, IN3, IN4, 7 - code);
        vTaskDelayUntil(&start, pdMS_TO_TICKS(500));
    }
}
