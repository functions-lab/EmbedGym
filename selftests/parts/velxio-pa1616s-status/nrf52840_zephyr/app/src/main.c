/*
 * PA1616S status selftest: GGA only (PMTK314) at 5 Hz (PMTK220) with the
 * antenna advisory on (PGCMD,33,1), after a firmware query (PMTK605). Prints
 * "FW <release>" for the query's answer, "GGA" / "ANT <status>" / "OTHER" per
 * sentence, and "FIX <ms>" / "PPS <ms>" for every pulse on the status pins.
 */
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/sys/printk.h>

enum source { SOURCE_UART, SOURCE_FIX, SOURCE_PPS };

struct event {
	uint8_t source;
	uint8_t byte;
	int32_t width_ms;
};

static const struct device *const gps = DEVICE_DT_GET(DT_NODELABEL(uart1));
static const struct gpio_dt_spec fix_pin = GPIO_DT_SPEC_GET(DT_ALIAS(gps_fix), gpios);
static const struct gpio_dt_spec pps_pin = GPIO_DT_SPEC_GET(DT_ALIAS(gps_pps), gpios);
static struct gpio_callback fix_cb, pps_cb;
static int64_t rise_ms[2];

K_MSGQ_DEFINE(events, sizeof(struct event), 256, 4);

static void on_uart(const struct device *dev, void *user_data)
{
	struct event ev = { .source = SOURCE_UART };

	while (uart_irq_update(dev) && uart_irq_rx_ready(dev)) {
		if (uart_fifo_read(dev, &ev.byte, 1) == 1) {
			k_msgq_put(&events, &ev, K_NO_WAIT);
		}
	}
}

static void on_status_edge(const struct gpio_dt_spec *pin, uint8_t source)
{
	int64_t now = k_uptime_get();

	if (gpio_pin_get_dt(pin) == 1) {
		rise_ms[source - SOURCE_FIX] = now;
		return;
	}
	struct event ev = { .source = source, .width_ms = (int32_t)(now - rise_ms[source - SOURCE_FIX]) };

	k_msgq_put(&events, &ev, K_NO_WAIT);
}

static void on_fix_edge(const struct device *port, struct gpio_callback *cb, uint32_t pins)
{
	on_status_edge(&fix_pin, SOURCE_FIX);
}

static void on_pps_edge(const struct device *port, struct gpio_callback *cb, uint32_t pins)
{
	on_status_edge(&pps_pin, SOURCE_PPS);
}

static void watch(const struct gpio_dt_spec *pin, struct gpio_callback *cb, gpio_callback_handler_t handler)
{
	gpio_pin_configure_dt(pin, GPIO_INPUT);
	gpio_init_callback(cb, handler, BIT(pin->pin));
	gpio_add_callback(pin->port, cb);
	gpio_pin_interrupt_configure_dt(pin, GPIO_INT_EDGE_BOTH);
}

static void send_command(const char *command)
{
	for (const char *c = command; *c != '\0'; c++) {
		uart_poll_out(gps, *c);
	}
}

static void on_sentence(char *line)
{
	char *star = strchr(line, '*');

	if (star != NULL) {
		*star = '\0';
	}
	if (strncmp(line, "$PMTK705,", 9) == 0) {
		*strchr(line + 9, ',') = '\0';
		printk("FW %s\n", line + 9);
	} else if (strncmp(line, "$PGTOP,11,", 10) == 0) {
		printk("ANT %s\n", line + 10);
	} else if (strncmp(line, "$GPGGA,", 7) == 0) {
		printk("GGA\n");
	} else if (strncmp(line, "$PMTK001,", 9) != 0 && strncmp(line, "$PGACK,", 7) != 0) {
		printk("OTHER\n");
	}
}

int main(void)
{
	char line[128];
	size_t length = 0;
	struct event ev;

	watch(&fix_pin, &fix_cb, on_fix_edge);
	watch(&pps_pin, &pps_cb, on_pps_edge);
	uart_irq_callback_user_data_set(gps, on_uart, NULL);
	uart_irq_rx_enable(gps);
	send_command("$PMTK314,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*29\r\n");
	send_command("$PMTK605*31\r\n");
	send_command("$PGCMD,33,1*6C\r\n");
	send_command("$PMTK220,200*2C\r\n");

	while (1) {
		k_msgq_get(&events, &ev, K_FOREVER);
		if (ev.source == SOURCE_FIX) {
			printk("FIX %d\n", ev.width_ms);
		} else if (ev.source == SOURCE_PPS) {
			printk("PPS %d\n", ev.width_ms);
		} else if (ev.byte == '\n') {
			line[length] = '\0';
			on_sentence(line);
			length = 0;
		} else if (ev.byte != '\r' && length < sizeof(line) - 1) {
			line[length++] = ev.byte;
		}
	}
	return 0;
}
