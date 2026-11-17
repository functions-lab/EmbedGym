// HM-10 BIT7 (ESP32-S3 variant of the AVR sketch): UART1 (TX GPIO5, RX GPIO4)
// at 9600 7N2 sends "AT"; module bytes go to the console.
#include "driver/uart.h"

#define HM10_UART UART_NUM_1

void app_main(void)
{
    const uart_config_t cfg = {
        .baud_rate = 9600,
        .data_bits = UART_DATA_7_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_2,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_APB,
    };
    uart_driver_install(UART_NUM_0, 256, 0, 0, NULL, 0);
    uart_driver_install(HM10_UART, 512, 0, 0, NULL, 0);
    uart_param_config(HM10_UART, &cfg);
    uart_set_pin(HM10_UART, 5, 4, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    uart_write_bytes(HM10_UART, "AT", 2);
    for (;;) {
        uint8_t byte;
        if (uart_read_bytes(HM10_UART, &byte, 1, portMAX_DELAY) == 1) uart_write_bytes(UART_NUM_0, &byte, 1);
    }
}
