// MAX32664 selftest firmware for nrf52840_zephyr: the calls of the AVR
// selftest, as the SparkFun Bio Sensor Hub library puts them on the wire, over
// raw I2C on i2c0 plus the RST and MFIO GPIOs. Every command is a write
// transfer, a delay, then a read transfer led by a status byte.
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>

#define HUB_ADDR            0x55
#define CMD_DELAY_MS        6
#define ENABLE_CMD_DELAY_MS 45
#define ERR_UNKNOWN         0xFF

#define MAX30101_INDEX         0x03
#define CONFIGURATION_REGISTER 0x0A
#define MODE_TWO               0x02

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec rst = GPIO_DT_SPEC_GET(DT_ALIAS(max32664_rst), gpios);
static const struct gpio_dt_spec mfio = GPIO_DT_SPEC_GET(DT_ALIAS(max32664_mfio), gpios);

// Returns the hub's status byte, or ERR_UNKNOWN when a transfer fails.
static uint8_t hub_command(const uint8_t *cmd, size_t cmd_len, int delay_ms, uint8_t *data, size_t data_len)
{
    uint8_t reply[1 + 36];

    if (i2c_write(i2c, cmd, cmd_len, HUB_ADDR) < 0) {
        return ERR_UNKNOWN;
    }
    k_msleep(delay_ms);
    if (i2c_read(i2c, reply, 1 + data_len, HUB_ADDR) < 0) {
        return ERR_UNKNOWN;
    }
    for (size_t i = 0; i < data_len; i++) {
        data[i] = reply[1 + i];
    }
    return reply[0];
}

static uint8_t hub_write(uint8_t family, uint8_t index, uint8_t value, int delay_ms)
{
    const uint8_t cmd[] = { family, index, value };
    return hub_command(cmd, sizeof(cmd), delay_ms, NULL, 0);
}

static uint8_t hub_read(uint8_t family, uint8_t index)
{
    const uint8_t cmd[] = { family, index };
    uint8_t value;
    uint8_t status = hub_command(cmd, sizeof(cmd), CMD_DELAY_MS, &value, 1);
    return status ? status : value;
}

static uint8_t hub_read_arg(uint8_t family, uint8_t index, uint8_t arg)
{
    const uint8_t cmd[] = { family, index, arg };
    uint8_t value;
    uint8_t status = hub_command(cmd, sizeof(cmd), CMD_DELAY_MS, &value, 1);
    return status ? status : value;
}

static uint8_t hub_begin(void)
{
    gpio_pin_configure_dt(&mfio, GPIO_OUTPUT_ACTIVE);
    gpio_pin_configure_dt(&rst, GPIO_OUTPUT_INACTIVE);
    k_msleep(10);
    gpio_pin_set_dt(&rst, 1);
    k_msleep(1000);
    gpio_pin_configure_dt(&mfio, GPIO_INPUT);
    return hub_read(0x02, 0x00);
}

static void max30101_set_bits(uint8_t keep_mask, uint8_t bits)
{
    const uint8_t value = (hub_read_arg(0x41, MAX30101_INDEX, CONFIGURATION_REGISTER) & keep_mask) | bits;
    const uint8_t cmd[] = { 0x40, MAX30101_INDEX, CONFIGURATION_REGISTER, value };
    hub_command(cmd, sizeof(cmd), CMD_DELAY_MS, NULL, 0);
}

static int max30101_field(const int *table, uint8_t mask, int shift)
{
    return table[(hub_read_arg(0x41, MAX30101_INDEX, CONFIGURATION_REGISTER) & mask) >> shift];
}

static void algo_config(uint8_t id, uint8_t value)
{
    const uint8_t cmd[] = { 0x50, 0x00, id, value };
    hub_command(cmd, sizeof(cmd), CMD_DELAY_MS, NULL, 0);
}

// The library's getMcuType(): it compares the type against its success code and
// reports ERR_UNKNOWN when they differ, so the hub's 0x01 never reaches the caller.
static uint8_t hub_mcu_type(void)
{
    uint8_t type = hub_read_arg(0xFF, 0x00, 0x00);
    return type != 0x00 ? ERR_UNKNOWN : type;
}

static uint8_t hub_config_bpm(uint8_t mode)
{
    uint8_t status;

    if ((status = hub_write(0x10, 0x00, 0x02, CMD_DELAY_MS)) != 0) {
        return status;
    }
    if ((status = hub_write(0x10, 0x01, 0x01, CMD_DELAY_MS)) != 0) {
        return status;
    }
    if ((status = hub_write(0x52, 0x00, 0x01, ENABLE_CMD_DELAY_MS)) != 0) {
        return status;
    }
    if ((status = hub_write(0x44, MAX30101_INDEX, 0x01, ENABLE_CMD_DELAY_MS)) != 0) {
        return status;
    }
    if ((status = hub_write(0x52, 0x02, mode, ENABLE_CMD_DELAY_MS)) != 0) {
        return status;
    }
    hub_read_arg(0x51, 0x00, 0x03);
    k_msleep(1000);
    return 0;
}

static void print_bpm_mode_two(void)
{
    static const uint8_t read_data[] = { 0x12, 0x01 };
    uint8_t d[11] = { 0 };

    if (hub_read(0x00, 0x00) != 1) {
        hub_read(0x12, 0x00);
        hub_command(read_data, sizeof(read_data), CMD_DELAY_MS, d, sizeof(d));
    }
    const int r_tenths = sys_get_be16(&d[6]);
    printk("HR: %d Conf: %d O2: %d Status: %d R: %d.%d\n",
           sys_get_be16(&d[0]) / 10, d[2], sys_get_be16(&d[3]) / 10, d[5], r_tenths / 10, r_tenths % 10);
}

int main(void)
{
    static const int pulse_width_us[] = { 69, 118, 215, 411 };
    static const int sample_rate_hz[] = { 50, 100, 200, 400, 800, 1000, 1600, 3200 };
    static const int adc_range_na[] = { 2048, 4096, 8192, 16384 };

    if (!device_is_ready(i2c) || !gpio_is_ready_dt(&rst) || !gpio_is_ready_dt(&mfio)) {
        printk("devices not ready\n");
        return 1;
    }
    printk("Begin: %d\n", hub_begin());

    max30101_set_bits(0xFC, 3);       // 411 µs
    max30101_set_bits(0xE3, 3 << 2);  // 400 Hz
    max30101_set_bits(0x9F, 3 << 5);  // 16384 nA
    printk("Width: %d\n", max30101_field(pulse_width_us, 0x03, 0));
    printk("Rate: %d\n", max30101_field(sample_rate_hz, 0x1C, 2));
    printk("Range: %d\n", max30101_field(adc_range_na, 0x60, 5));

    algo_config(0x00, 60);
    algo_config(0x01, 12);
    printk("AlgoRange: %d\n", hub_read_arg(0x51, 0x00, 0x00));
    printk("AlgoStep: %d\n", hub_read_arg(0x51, 0x00, 0x01));

    printk("Mcu: %d\n", hub_mcu_type());

    printk("Config: %d\n", hub_config_bpm(MODE_TWO));

    for (;;) {
        print_bpm_mode_two();
        k_msleep(500);
    }
    return 0;
}
