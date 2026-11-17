/* HM-10 PIO (nRF52840 variant of the AVR sketch): PIO1 read on P1.04 and PIO2
 * on P1.05, each printed on change; P1.06 drives PIO4 HIGH until 1500 ms. */
#include <stdio.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/uart.h>

#define LED_PIN 4
#define PIO2_PIN 5
#define PIO4_PIN 6

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const port1 = DEVICE_DT_GET(DT_NODELABEL(gpio1));

static void print_level(const char *name, int level)
{
	char line[16];

	snprintf(line, sizeof line, "%s: %d\r\n", name, level);
	for (const char *p = line; *p; p++) {
		uart_poll_out(console, *p);
	}
}

int main(void)
{
	bool first = true, released = false;
	int previous_led = 0, previous_pio2 = 0;

	gpio_pin_configure(port1, LED_PIN, GPIO_INPUT);
	gpio_pin_configure(port1, PIO2_PIN, GPIO_INPUT);
	gpio_pin_configure(port1, PIO4_PIN, GPIO_OUTPUT_ACTIVE);
	while (1) {
		if (!released && k_uptime_get() >= 1500) {
			gpio_pin_set(port1, PIO4_PIN, 0);
			released = true;
		}
		const int led = gpio_pin_get(port1, LED_PIN);
		const int pio2 = gpio_pin_get(port1, PIO2_PIN);

		if (first || led != previous_led) {
			print_level("PIO1", led);
			previous_led = led;
		}
		if (first || pio2 != previous_pio2) {
			print_level("PIO2", pio2);
			previous_pio2 = pio2;
		}
		first = false;
		k_msleep(1);
	}
	return 0;
}
