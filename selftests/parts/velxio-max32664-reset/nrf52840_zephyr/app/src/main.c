// MAX32664 reset selftest for nrf52840_zephyr: the hub reads MFIO as RST rises.
// Device mode after a reset with MFIO HIGH (0), with MFIO LOW (8, bootloader),
// after the exit-bootloader command (0), MFIO LOW again (8), MFIO as a
// pulled-up input (0).
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/printk.h>

#define HUB_ADDR     0x55
#define CMD_DELAY_MS 6

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec rst = GPIO_DT_SPEC_GET(DT_ALIAS(max32664_rst), gpios);
static const struct gpio_dt_spec mfio = GPIO_DT_SPEC_GET(DT_ALIAS(max32664_mfio), gpios);

static uint8_t hub_command(const uint8_t *cmd, size_t cmd_len, size_t reply_len)
{
    uint8_t reply[2] = { 0 };

    if (i2c_write(i2c, cmd, cmd_len, HUB_ADDR) < 0) {
        return 0xFF;
    }
    k_msleep(CMD_DELAY_MS);
    if (i2c_read(i2c, reply, reply_len, HUB_ADDR) < 0) {
        return 0xFF;
    }
    return reply[0] ? 0xFF : reply[1];
}

static void print_mode(void)
{
    static const uint8_t read_mode[] = { 0x02, 0x00 };
    printk("Mode: %d\n", hub_command(read_mode, sizeof(read_mode), 2));
}

static void reset_pulse(int settle_ms)
{
    gpio_pin_set_dt(&rst, 0);
    k_msleep(10);
    gpio_pin_set_dt(&rst, 1);
    k_msleep(settle_ms);
}

int main(void)
{
    static const uint8_t exit_bootloader[] = { 0x01, 0x00, 0x00 };

    if (!device_is_ready(i2c) || !gpio_is_ready_dt(&rst) || !gpio_is_ready_dt(&mfio)) {
        printk("devices not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&rst, GPIO_OUTPUT_ACTIVE);

    gpio_pin_configure_dt(&mfio, GPIO_OUTPUT_ACTIVE);
    reset_pulse(1000);
    print_mode();

    gpio_pin_set_dt(&mfio, 0);
    reset_pulse(50);
    print_mode();

    hub_command(exit_bootloader, sizeof(exit_bootloader), 1);
    print_mode();

    reset_pulse(50);
    print_mode();

    gpio_pin_configure_dt(&mfio, GPIO_INPUT);
    reset_pulse(50);
    print_mode();
    return 0;
}
