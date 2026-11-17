/* HM-10 command LED (nRF52840 variant of the AVR sketch): module byte '1'
 * lights the LED on P1.15 and answers "LED=ON", '0' clears it and answers
 * "LED=OFF", on uart1 (9600 8N1) and on the console. */
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/uart.h>

#define LED_PIN 15

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const module = DEVICE_DT_GET(DT_NODELABEL(uart1));
static const struct device *const port1 = DEVICE_DT_GET(DT_NODELABEL(gpio1));
K_MSGQ_DEFINE(from_module, 1, 256, 1);

static void on_rx(const struct device *dev, void *user_data)
{
	uint8_t byte;

	while (uart_irq_update(dev) && uart_irq_rx_ready(dev)) {
		if (uart_fifo_read(dev, &byte, 1) == 1) {
			k_msgq_put(&from_module, &byte, K_NO_WAIT);
		}
	}
}

static void reply(const char *text)
{
	for (const char *p = text; *p; p++) {
		uart_poll_out(module, *p);
	}
	for (const char *p = text; *p; p++) {
		uart_poll_out(console, *p);
	}
}

int main(void)
{
	uint8_t command;

	gpio_pin_configure(port1, LED_PIN, GPIO_OUTPUT_INACTIVE);
	uart_irq_callback_user_data_set(module, on_rx, NULL);
	uart_irq_rx_enable(module);
	while (1) {
		k_msgq_get(&from_module, &command, K_FOREVER);
		if (command == '1') {
			gpio_pin_set(port1, LED_PIN, 1);
			reply("LED=ON\r\n");
		} else if (command == '0') {
			gpio_pin_set(port1, LED_PIN, 0);
			reply("LED=OFF\r\n");
		}
	}
	return 0;
}
