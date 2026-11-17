/* HM-10 bridge (nRF52840 variant of the AVR sketch): console bytes go to the
 * module on uart1 (9600 8N1), module bytes to the console. */
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const module = DEVICE_DT_GET(DT_NODELABEL(uart1));
K_MSGQ_DEFINE(to_module, 1, 256, 1);
K_MSGQ_DEFINE(to_console, 1, 256, 1);

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

static void forward(void *queue, void *dev, void *unused)
{
	uint8_t byte;

	while (1) {
		k_msgq_get(queue, &byte, K_FOREVER);
		uart_poll_out(dev, byte);
	}
}

K_THREAD_STACK_DEFINE(module_stack, 512);
K_THREAD_STACK_DEFINE(console_stack, 512);
static struct k_thread module_thread, console_thread;

int main(void)
{
	uart_irq_callback_user_data_set(console, on_rx, &to_module);
	uart_irq_callback_user_data_set(module, on_rx, &to_console);
	uart_irq_rx_enable(console);
	uart_irq_rx_enable(module);
	k_thread_create(&module_thread, module_stack, K_THREAD_STACK_SIZEOF(module_stack), forward,
			&to_module, (void *)module, NULL, 5, 0, K_NO_WAIT);
	k_thread_create(&console_thread, console_stack, K_THREAD_STACK_SIZEOF(console_stack), forward,
			&to_console, (void *)console, NULL, 5, 0, K_NO_WAIT);
	return 0;
}
