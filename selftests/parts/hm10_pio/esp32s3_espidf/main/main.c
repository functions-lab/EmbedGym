// HM-10 PIO (ESP32-S3 variant of the AVR sketch): PIO1 read on GPIO6 and PIO2
// on GPIO7, each printed on change; GPIO15 drives PIO4 HIGH until 1500 ms.
#include <stdio.h>
#include <string.h>
#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define LED_GPIO 6
#define PIO2_GPIO 7
#define PIO4_GPIO 15

static void print_level(const char *name, int level)
{
    char line[16];
    snprintf(line, sizeof line, "%s: %d\r\n", name, level);
    uart_write_bytes(UART_NUM_0, line, strlen(line));
}

void app_main(void)
{
    const int64_t start = esp_timer_get_time();
    uart_driver_install(UART_NUM_0, 256, 0, 0, NULL, 0);
    gpio_reset_pin(LED_GPIO);
    gpio_set_direction(LED_GPIO, GPIO_MODE_INPUT);
    gpio_reset_pin(PIO2_GPIO);
    gpio_set_direction(PIO2_GPIO, GPIO_MODE_INPUT);
    gpio_reset_pin(PIO4_GPIO);
    gpio_set_direction(PIO4_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(PIO4_GPIO, 1);
    bool first = true, released = false;
    int previous_led = 0, previous_pio2 = 0;
    for (;;) {
        if (!released && esp_timer_get_time() - start >= 1500000) {
            gpio_set_level(PIO4_GPIO, 0);
            released = true;
        }
        const int led = gpio_get_level(LED_GPIO);
        const int pio2 = gpio_get_level(PIO2_GPIO);
        if (first || led != previous_led) { print_level("PIO1", led); previous_led = led; }
        if (first || pio2 != previous_pio2) { print_level("PIO2", pio2); previous_pio2 = pio2; }
        first = false;
        vTaskDelay(1);
    }
}
