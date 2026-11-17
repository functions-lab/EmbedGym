// HM-10 flow control (ESP32-S3 variant of the AVR sketch): CTS on GPIO6 held
// HIGH until 300 ms, RTS read on GPIO7 and printed; UART1 (TX GPIO5, RX
// GPIO4, 9600 8N1) sends "AT" and module bytes go to the console.
#include <stdio.h>
#include <string.h>
#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_log.h"
#include "esp_timer.h"

#define HM10_UART UART_NUM_1
#define CTS_GPIO 6
#define RTS_GPIO 7

void app_main(void)
{
    const uart_config_t cfg = {
        .baud_rate = 9600,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_APB,
    };
    const int64_t start = esp_timer_get_time();
    esp_log_level_set("gpio", ESP_LOG_WARN);
    uart_driver_install(UART_NUM_0, 256, 0, 0, NULL, 0);
    gpio_reset_pin(CTS_GPIO);
    gpio_set_direction(CTS_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(CTS_GPIO, 1);
    gpio_reset_pin(RTS_GPIO);
    gpio_set_direction(RTS_GPIO, GPIO_MODE_INPUT);
    uart_driver_install(HM10_UART, 512, 0, 0, NULL, 0);
    uart_param_config(HM10_UART, &cfg);
    uart_set_pin(HM10_UART, 5, 4, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    char line[16];
    snprintf(line, sizeof line, "RTS=%d\r\n", gpio_get_level(RTS_GPIO));
    uart_write_bytes(UART_NUM_0, line, strlen(line));
    uart_write_bytes(HM10_UART, "AT", 2);
    bool released = false;
    for (;;) {
        if (!released && esp_timer_get_time() - start >= 300000) {
            gpio_set_level(CTS_GPIO, 0);
            released = true;
        }
        uint8_t byte;
        if (uart_read_bytes(HM10_UART, &byte, 1, 1) == 1) uart_write_bytes(UART_NUM_0, &byte, 1);
    }
}
