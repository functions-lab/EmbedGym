/* HM-10 binary path (nRF52840 variant of the AVR sketch): console bytes go to
 * the module on uart1 (9600 8N1); every module byte goes to the console and
 * back to the module. */
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const module = DEVICE_DT_GET(DT_NODELABEL(uart1));
K_MSGQ_DEFINE(to_module, 1, 256, 1);
K_MSGQ_DEFINE(from_module, 1, 256, 1);

static void on_rx(const struct device *dev, void *user_data)
{
	struct k_msgq *queue = user_data;
	uint8_t byte;

	while (uart_irq_update(dev) && uart_irq_rx_ready(dev)) {
		if (uart_fifo_read(dev, &byte, 1) == 1) {
			k_msgq_put(queue, &byte, K_NO_WAIT);
		}
	}
}

static void forward(void *unused1, void *unused2, void *unused3)
{
	uint8_t byte;

	while (1) {
		k_msgq_get(&to_module, &byte, K_FOREVER);
		uart_poll_out(module, byte);
	}
}

K_THREAD_DEFINE(forwarder, 512, forward, NULL, NULL, NULL, 5, 0, 0);

int main(void)
{
	uint8_t byte;

	uart_irq_callback_user_data_set(console, on_rx, &to_module);
	uart_irq_callback_user_data_set(module, on_rx, &from_module);
	uart_irq_rx_enable(console);
	uart_irq_rx_enable(module);
	while (1) {
		k_msgq_get(&from_module, &byte, K_FOREVER);
		uart_poll_out(console, byte);
		uart_poll_out(module, byte);
	}
	return 0;
}
