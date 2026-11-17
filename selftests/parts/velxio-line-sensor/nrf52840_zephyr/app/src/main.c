// Line sensor unit test firmware (nRF52840 / Zephyr variant of code/code.ino):
// the 5 V sensor's L/M/R reach P1.10..P1.12 through level-shifter channels.
// P1.11 keeps its internal pull-up, which the shifter's LV pull-up dominates.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

static const struct gpio_dt_spec lines[] = {
    GPIO_DT_SPEC_GET(DT_ALIAS(line_left), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(line_middle), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(line_right), gpios),
};

int main(void)
{
    for (int i = 0; i < 3; i++) {
        if (!gpio_is_ready_dt(&lines[i])) {
            return 1;
        }
        gpio_pin_configure_dt(&lines[i], GPIO_INPUT);
    }
    for (;;) {
        printk("Bits %d%d%d\n", gpio_pin_get_dt(&lines[0]), gpio_pin_get_dt(&lines[1]), gpio_pin_get_dt(&lines[2]));
        k_msleep(100);
    }
    return 0;
}
