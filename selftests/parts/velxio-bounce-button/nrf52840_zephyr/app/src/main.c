// Bounce button unit test firmware (nRF52840 / Zephyr variant of code/code.ino).
//
// Pull-down button: P1.11 idles LOW through R_PD and reads HIGH while the
// switch is closed. The loop samples the pin without sleeping and timestamps
// every raw transition on TIMER1 at 1 MHz (the system clock ticks at 30.5 µs).
// Once the level has held for SETTLE_US it reports the debounced event: how
// many transitions the contacts made, and when each one after the first came,
// in µs after the first.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include <hal/nrf_timer.h>

#define SETTLE_US 20000
#define MAX_EDGES 8

static const struct gpio_dt_spec button = GPIO_DT_SPEC_GET(DT_ALIAS(my_button), gpios);

static uint32_t micros(void)
{
    nrf_timer_task_trigger(NRF_TIMER1, NRF_TIMER_TASK_CAPTURE0);
    return nrf_timer_cc_get(NRF_TIMER1, NRF_TIMER_CC_CHANNEL0);
}

int main(void)
{
    if (!gpio_is_ready_dt(&button)) {
        printk("Button GPIO not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&button, GPIO_INPUT);

    nrf_timer_mode_set(NRF_TIMER1, NRF_TIMER_MODE_TIMER);
    nrf_timer_bit_width_set(NRF_TIMER1, NRF_TIMER_BIT_WIDTH_32);
    nrf_timer_prescaler_set(NRF_TIMER1, NRF_TIMER_FREQ_1MHz);
    nrf_timer_task_trigger(NRF_TIMER1, NRF_TIMER_TASK_START);

    int stable = gpio_pin_get_dt(&button);
    int last = stable;
    int edges = 0;
    uint32_t edge_us[MAX_EDGES];
    uint32_t last_edge_us = 0;
    for (;;) {
        uint32_t now = micros();
        int level = gpio_pin_get_dt(&button);
        if (level != last) {
            last = level;
            if (edges < MAX_EDGES) edge_us[edges] = now;
            edges++;
            last_edge_us = now;
        }
        if (edges > 0 && now - last_edge_us >= SETTLE_US) {
            if (level == stable) {
                printk("Glitch edges: %d\n", edges);
            } else {
                stable = level;
                const char *name = level ? "Press" : "Release";
                printk("%s edges: %d\n%s bounce:", name, edges, name);
                for (int i = 1; i < edges && i < MAX_EDGES; i++) {
                    printk(" %u", edge_us[i] - edge_us[0]);
                }
                printk("\n");
            }
            edges = 0;
        }
    }
    return 0;
}
