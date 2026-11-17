// HM-10 parity (ESP32-S3 variant of the AVR sketch): UART1 (TX GPIO5, RX
// GPIO4) at 9600 8E2; every module byte goes to the console and back.
#include "driver/uart.h"

#define HM10_UART UART_NUM_1

void app_main(void)
{
    const uart_config_t cfg = {
        .baud_rate = 9600,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_EVEN,
        .stop_bits = UART_STOP_BITS_2,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_APB,
    };
    uart_driver_install(UART_NUM_0, 256, 0, 0, NULL, 0);
    uart_driver_install(HM10_UART, 512, 0, 0, NULL, 0);
    uart_param_config(HM10_UART, &cfg);
    uart_set_pin(HM10_UART, 5, 4, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    for (;;) {
        uint8_t byte;
        if (uart_read_bytes(HM10_UART, &byte, 1, portMAX_DELAY) != 1) continue;
        uart_write_bytes(UART_NUM_0, &byte, 1);
        uart_write_bytes(HM10_UART, &byte, 1);
    }
}
