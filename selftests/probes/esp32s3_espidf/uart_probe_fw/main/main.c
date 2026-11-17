// UART1 / UART2 receive probe firmware (see ../uart_probe.py).
//
// Opens UART1 at 9600 8N1 on GPIO17 (TX) / GPIO18 (RX) through the legacy
// driver, then for every chunk uart_read_bytes hands back prints
//   GYMRX <port> <t_us> <n> <text>
// on the console and echoes the chunk back on the same UART. After 3 s of
// app time it deletes the UART1 driver and does the same on UART2 with the
// same pins, so the probe can inject into both peripherals of one run.
#include <stdio.h>
#include <string.h>
#include "driver/uart.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define MODULE_RX_GPIO 17   /* board TX -> module RX */
#define MODULE_TX_GPIO 18   /* board RX <- module TX */
#define SWITCH_AT_US   3000000LL

static void open_uart(uart_port_t port)
{
    uart_config_t cfg = {
        .baud_rate = 9600,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_APB,
    };
    esp_err_t e1 = uart_driver_install(port, 512, 0, 0, NULL, 0);
    esp_err_t e2 = uart_param_config(port, &cfg);
    esp_err_t e3 = uart_set_pin(port, MODULE_RX_GPIO, MODULE_TX_GPIO,
                                UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    uint32_t baud = 0;
    uart_get_baudrate(port, &baud);
    printf("GYMUART open %d err %d %d %d baud %u\n", (int)port, e1, e2, e3, (unsigned)baud);
    fflush(stdout);
}

static void serve(uart_port_t port, int64_t until_us)
{
    static uint8_t buf[256];
    while (until_us < 0 || esp_timer_get_time() < until_us) {
        int n = uart_read_bytes(port, buf, sizeof(buf) - 1, pdMS_TO_TICKS(10));
        if (n <= 0) continue;
        int64_t t = esp_timer_get_time();
        for (int i = 0; i < n; i++) {
            if (buf[i] < 0x20 || buf[i] > 0x7e) buf[i] = '.';
        }
        buf[n] = 0;
        printf("GYMRX %d %lld %d %s\n", (int)port, t, n, (char *)buf);
        fflush(stdout);
        uart_write_bytes(port, (const char *)buf, n);
    }
}

void app_main(void)
{
    open_uart(UART_NUM_1);
    serve(UART_NUM_1, SWITCH_AT_US);
    uart_driver_delete(UART_NUM_1);
    printf("GYMUART closed 1\n");
    open_uart(UART_NUM_2);
    serve(UART_NUM_2, -1);
}
