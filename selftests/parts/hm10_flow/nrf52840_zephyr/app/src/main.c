/* HM-10 flow control (nRF52840 variant of the AVR sketch): CTS on P1.04 held
 * HIGH until 300 ms, RTS read on P1.05 and printed; uart1 (9600 8N1) sends
 * "AT" and module bytes go to the console. */
#include <stdio.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/uart.h>

#define CTS_PIN 4
#define RTS_PIN 5

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const module = DEVICE_DT_GET(DT_NODELABEL(uart1));
static const struct device *const port1 = DEVICE_DT_GET(DT_NODELABEL(gpio1));

static void write_text(const struct device *dev, const char *text)
{
	for (const char *p = text; *p; p++) {
		uart_poll_out(dev, *p);
	}
}

int main(void)
{
	char line[16];
	bool released = false;

	gpio_pin_configure(port1, CTS_PIN, GPIO_OUTPUT_ACTIVE);
	gpio_pin_configure(port1, RTS_PIN, GPIO_INPUT);
	snprintf(line, sizeof line, "RTS=%d\r\n", gpio_pin_get(port1, RTS_PIN));
	write_text(console, line);
	write_text(module, "AT");
	while (1) {
		unsigned char byte;

		if (!released && k_uptime_get() >= 300) {
			gpio_pin_set(port1, CTS_PIN, 0);
			released = true;
		}
		if (uart_poll_in(module, &byte) == 0) {
			uart_poll_out(console, byte);
		} else {
			k_msleep(1);
		}
	}
	return 0;
}
