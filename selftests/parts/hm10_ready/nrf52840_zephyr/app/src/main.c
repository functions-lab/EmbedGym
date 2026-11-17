/* HM-10 readiness (nRF52840 variant of the AVR sketch): uart1 (9600 8N1)
 * sends PROBE and waits up to 2 s for "OK", reports the result, then copies
 * module bytes to the console. */
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>

#define PROBE "AT"

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const module = DEVICE_DT_GET(DT_NODELABEL(uart1));

static void write_text(const struct device *dev, const char *text)
{
	for (const char *p = text; *p; p++) {
		uart_poll_out(dev, *p);
	}
}

int main(void)
{
	char reply[64] = "";
	size_t length = 0;
	bool ready = false;
	unsigned char byte;

	write_text(module, PROBE);
	const int64_t start = k_uptime_get();

	while (!ready && k_uptime_get() - start < 2000) {
		if (uart_poll_in(module, &byte) == 0 && length < sizeof reply - 1) {
			reply[length++] = (char)byte;
			reply[length] = 0;
		}
		ready = strstr(reply, "OK") != NULL;
	}
	write_text(console, ready ? "HM-10 Ready\r\n" : "HM-10 Not Responding\r\n");
	while (1) {
		if (uart_poll_in(module, &byte) == 0) {
			uart_poll_out(console, byte);
		} else {
			k_msleep(1);
		}
	}
	return 0;
}
