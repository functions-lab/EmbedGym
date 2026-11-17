/* HM-10 parity (nRF52840 variant of the AVR sketch): uart1 at 9600 8E2; every
 * module byte goes to the console and back to the module. */
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>

static const struct device *const console = DEVICE_DT_GET(DT_NODELABEL(uart0));
static const struct device *const module = DEVICE_DT_GET(DT_NODELABEL(uart1));
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

int main(void)
{
	const struct uart_config cfg = {
		.baudrate = 9600,
		.parity = UART_CFG_PARITY_EVEN,
		.stop_bits = UART_CFG_STOP_BITS_2,
		.data_bits = UART_CFG_DATA_BITS_8,
		.flow_ctrl = UART_CFG_FLOW_CTRL_NONE,
	};
	uint8_t byte;

	if (uart_configure(module, &cfg) != 0) {
		printk("uart1 8E2 rejected\n");
		return 0;
	}
	uart_irq_callback_user_data_set(module, on_rx, NULL);
	uart_irq_rx_enable(module);
	while (1) {
		k_msgq_get(&from_module, &byte, K_FOREVER);
		uart_poll_out(console, byte);
		uart_poll_out(module, byte);
	}
	return 0;
}
