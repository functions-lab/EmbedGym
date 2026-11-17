// SGP40 selftest firmware for nrf52840_zephyr.
//
// Measurements go through Zephyr's own sgp40 driver (measure raw with the
// compensation words of its attributes, 30 ms wait, CRC check). The commands
// the driver never sends are raw transfers on the same bus: serial number,
// featureset, self-test, heater off, soft reset. A reply read before its
// command's duration has passed must be NACKed (-EIO). Any broken
// expectation halts with its reason on the console.
#include <errno.h>

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/drivers/sensor/sgp40.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/crc.h>
#include <zephyr/sys/printk.h>

#define SGP40_ADDR 0x59

#define CMD_SERIAL_NUMBER 0x3682
#define CMD_FEATURESET    0x202F
#define CMD_SELF_TEST     0x280E
#define CMD_HEATER_OFF    0x3615
#define CMD_SOFT_RESET    0x0006

#define SELF_TEST_PASS 0xD400
#define FEATURESET     0x0020

static const struct device *const gas = DEVICE_DT_GET_ONE(sensirion_sgp40);
static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));

static void halt(const char *why)
{
    printk("%s\n", why);
    for (;;) {
        k_sleep(K_FOREVER);
    }
}

static void command(uint16_t cmd)
{
    uint8_t tx[2];

    sys_put_be16(cmd, tx);
    if (i2c_write(i2c, tx, sizeof(tx), SGP40_ADDR) < 0) {
        halt("command write failed");
    }
}

// Reads `count` words; false when any word fails its CRC.
static bool read_words(uint16_t *words, size_t count)
{
    uint8_t rx[9];

    if (i2c_read(i2c, rx, count * 3, SGP40_ADDR) < 0) {
        halt("reply read failed");
    }
    for (size_t i = 0; i < count; i++) {
        if (crc8(&rx[i * 3], 2, 0x31, 0xFF, false) != rx[i * 3 + 2]) {
            return false;
        }
        words[i] = sys_get_be16(&rx[i * 3]);
    }
    return true;
}

static bool self_test(void)
{
    uint16_t result;

    command(CMD_SELF_TEST);
    k_msleep(320);
    return read_words(&result, 1) && result == SELF_TEST_PASS;
}

static void set_compensation(int temperature, int humidity)
{
    struct sensor_value value = { .val1 = temperature };

    if (sensor_attr_set(gas, SENSOR_CHAN_GAS_RES, (enum sensor_attribute)SENSOR_ATTR_SGP40_TEMPERATURE, &value) < 0) {
        halt("temperature attribute rejected");
    }
    value.val1 = humidity;
    if (sensor_attr_set(gas, SENSOR_CHAN_GAS_RES, (enum sensor_attribute)SENSOR_ATTR_SGP40_HUMIDITY, &value) < 0) {
        halt("humidity attribute rejected");
    }
}

static int measure(void)
{
    struct sensor_value raw;

    if (sensor_sample_fetch(gas) < 0) {
        halt("fetch failed");
    }
    sensor_channel_get(gas, SENSOR_CHAN_GAS_RES, &raw);
    return raw.val1;
}

int main(void)
{
    uint16_t words[3];
    uint8_t early[3];

    if (!device_is_ready(gas)) {
        halt("SGP40 not ready");
    }
    if (i2c_write(i2c, NULL, 0, SGP40_ADDR) < 0) {
        halt("address probe failed");
    }

    command(CMD_SERIAL_NUMBER);
    if (!read_words(words, 3)) {
        halt("serial number CRC");
    }
    printk("SERIAL %X %X %X\n", words[0], words[1], words[2]);

    command(CMD_FEATURESET);
    if (!read_words(words, 1) || words[0] != FEATURESET) {
        halt("featureset");
    }

    command(CMD_SELF_TEST);
    k_msleep(250);
    if (i2c_read(i2c, early, sizeof(early), SGP40_ADDR) != -EIO) {
        halt("self-test reply read before its 320 ms was not NACKed");
    }
    printk("SELFTEST %s\n", self_test() ? "PASS" : "FAIL");

    command(CMD_HEATER_OFF);
    printk("HEATEROFF OK\n");

    command(CMD_SOFT_RESET);
    printk("RESET OK\n");

    for (;;) {
        set_compensation(25, 50);
        printk("RAW %d\n", measure());

        set_compensation(30, 80);
        printk("COMP %d\n", measure());

        k_msleep(500);
    }
    return 0;
}
