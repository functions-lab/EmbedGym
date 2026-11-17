// HC-SR04 unit test firmware (nRF52840 / Zephyr variant of code/code.ino):
//   trigger every 200 ms, time the ECHO pulse between its two edge interrupts,
//   print the distance in cm. The harness pokes `set sensor.distance` partway
//   through, so the printed value must change to match.
// The edges are stamped with the 32768 Hz system clock (30.5 µs, 0.5 cm).
//
// echo pulse width (µs) = distance_cm * 58.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#define US_PER_CM 58

static const struct gpio_dt_spec trig = GPIO_DT_SPEC_GET(DT_ALIAS(sr04_trig), gpios);
static const struct gpio_dt_spec echo = GPIO_DT_SPEC_GET(DT_ALIAS(sr04_echo), gpios);

static struct gpio_callback echo_cb;
static uint32_t rise_cycles;
static uint32_t fall_cycles;
static K_SEM_DEFINE(echo_done, 0, 1);

static void on_echo_edge(const struct device *dev, struct gpio_callback *cb, uint32_t pins)
{
    if (gpio_pin_get_dt(&echo) == 1) {
        rise_cycles = k_cycle_get_32();
    } else {
        fall_cycles = k_cycle_get_32();
        k_sem_give(&echo_done);
    }
}

int main(void)
{
    if (!gpio_is_ready_dt(&trig) || !gpio_is_ready_dt(&echo)) {
        printk("GPIO not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&trig, GPIO_OUTPUT_INACTIVE);
    gpio_pin_configure_dt(&echo, GPIO_INPUT);
    gpio_init_callback(&echo_cb, on_echo_edge, BIT(echo.pin));
    gpio_add_callback(echo.port, &echo_cb);
    gpio_pin_interrupt_configure_dt(&echo, GPIO_INT_EDGE_BOTH);

    // A TRIG pulse under the 10 µs minimum must not start a measurement. The
    // wait lets the echo of the boot-time pulse on P0.05 (UART0 RTS) pass.
    k_msleep(5);
    k_sem_reset(&echo_done);
    gpio_pin_set_dt(&trig, 1);
    k_busy_wait(3);
    gpio_pin_set_dt(&trig, 0);
    printk(k_sem_take(&echo_done, K_MSEC(30)) == 0 ? "Short pulse: echoed\n" : "Short pulse: ignored\n");

    for (;;) {
        k_sem_reset(&echo_done);
        gpio_pin_set_dt(&trig, 1);
        k_busy_wait(10);
        gpio_pin_set_dt(&trig, 0);

        if (k_sem_take(&echo_done, K_MSEC(30)) == 0) {
            uint32_t width_us = k_cyc_to_us_near32(fall_cycles - rise_cycles);
            printk("Distance: %u cm\n", (width_us + US_PER_CM / 2) / US_PER_CM);
        } else {
            printk("No echo\n");
        }
        k_msleep(200);
    }
    return 0;
}
