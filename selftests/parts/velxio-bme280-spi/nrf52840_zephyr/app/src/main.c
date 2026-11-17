// BME280 SPI selftest firmware for nrf52840_zephyr.
//
// Reads through Zephyr's own bme280 driver on spi0 as SPIM, CS on a GPIO: one
// CS frame per register, chip-id check, soft reset with status polling, normal
// mode (temperature x2, pressure x16, humidity x16, 62.5 ms standby), status
// polling before each data read, and the datasheet's shift-form compensation.
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/sys/printk.h>

static const struct device *const env = DEVICE_DT_GET_ONE(bosch_bme280);

static void print_tenths(const char *label, int64_t micro)
{
    int64_t tenths = (micro + (micro < 0 ? -50000 : 50000)) / 100000;
    int64_t magnitude = tenths < 0 ? -tenths : tenths;

    printk("%s%s%d.%d", label, tenths < 0 ? "-" : "", (int)(magnitude / 10), (int)(magnitude % 10));
}

int main(void)
{
    if (!device_is_ready(env)) {
        printk("BME280 not ready\n");
        return 1;
    }
    struct sensor_value temp, press, hum;
    for (;;) {
        if (sensor_sample_fetch(env) < 0) {
            printk("BME280 fetch failed\n");
        } else {
            sensor_channel_get(env, SENSOR_CHAN_AMBIENT_TEMP, &temp);
            sensor_channel_get(env, SENSOR_CHAN_PRESS, &press);
            sensor_channel_get(env, SENSOR_CHAN_HUMIDITY, &hum);
            print_tenths("T=", sensor_value_to_micro(&temp));
            /* The driver reports kPa; the test reads hPa. */
            print_tenths(" P=", sensor_value_to_micro(&press) * 10);
            print_tenths(" H=", sensor_value_to_micro(&hum));
            printk("\n");
        }
        k_msleep(200);
    }
    return 0;
}
