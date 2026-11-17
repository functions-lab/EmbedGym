// LTR390 threshold-interrupt selftest firmware for nrf52840_zephyr: raw I2C on
// i2c0, INT on the ltr390-int alias. ALS mode with a 1000..50000 window; the
// falling edges of INT are counted and printed four times a second. MAIN_STATUS
// is never read, so INT stays LOW after the first event.
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>

#define LTR390_ADDR     0x53
#define REG_MAIN_CTRL   0x00
#define REG_MEAS_RATE   0x04
#define REG_GAIN        0x05
#define REG_PART_ID     0x06
#define REG_MAIN_STATUS 0x07
#define REG_INT_CFG     0x19
#define REG_THRES_UP    0x21

#define CTRL_ENABLE     0x02
#define CTRL_RESET      0x10
#define GAIN_3X         1
#define MEAS_18BIT_100MS 0x22
#define INT_ALS_ENABLED 0x14
#define THRES_LOW       1000
#define THRES_HIGH      50000

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec int_pin = GPIO_DT_SPEC_GET(DT_ALIAS(ltr390_int), gpios);
static struct gpio_callback int_cb;
static atomic_t events;

static void on_threshold(const struct device *port, struct gpio_callback *cb, uint32_t pins)
{
    atomic_inc(&events);
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t value = 0;
    if (i2c_reg_read_byte(i2c, LTR390_ADDR, reg, &value) < 0) {
        printk("read %d failed\n", reg);
    }
    return value;
}

static void write_reg(uint8_t reg, uint8_t value)
{
    if (i2c_reg_write_byte(i2c, LTR390_ADDR, reg, value) < 0) {
        printk("write %d failed\n", reg);
    }
}

int main(void)
{
    if (!device_is_ready(i2c) || !gpio_is_ready_dt(&int_pin)) {
        printk("devices not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&int_pin, GPIO_INPUT);

    if ((read_reg(REG_PART_ID) >> 4) != 0x0B) {
        printk("init failed\n");
        return 1;
    }
    write_reg(REG_MAIN_CTRL, CTRL_RESET);
    k_msleep(10);
    write_reg(REG_MAIN_CTRL, CTRL_ENABLE);
    write_reg(REG_GAIN, GAIN_3X);
    write_reg(REG_MEAS_RATE, MEAS_18BIT_100MS);

    const uint8_t thresholds[6] = {
        THRES_HIGH & 0xFF, (THRES_HIGH >> 8) & 0xFF, THRES_HIGH >> 16,
        THRES_LOW & 0xFF, (THRES_LOW >> 8) & 0xFF, THRES_LOW >> 16,
    };
    if (i2c_burst_write(i2c, LTR390_ADDR, REG_THRES_UP, thresholds, sizeof thresholds) < 0) {
        printk("threshold write failed\n");
    }
    write_reg(REG_INT_CFG, INT_ALS_ENABLED);

    // INT is active-low, so the assertion is the pin going active.
    gpio_init_callback(&int_cb, on_threshold, BIT(int_pin.pin));
    gpio_add_callback(int_pin.port, &int_cb);
    gpio_pin_interrupt_configure_dt(&int_pin, GPIO_INT_EDGE_TO_ACTIVE);

    while (1) {
        printk("EV: %ld\n", (long)atomic_get(&events));
        k_msleep(250);
    }
    return 0;
}
