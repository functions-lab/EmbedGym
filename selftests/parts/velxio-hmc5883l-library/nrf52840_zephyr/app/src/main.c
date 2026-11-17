// HMC5883L library selftest for nrf52840_zephyr: Zephyr's honeywell,hmc5883l
// driver (15 Hz, 1.3 Ga, continuous) in place of the Adafruit library. The
// driver has no runtime gain attribute, so the sweep writes CRB on the bus
// and converts the driver's gauss back to counts at its fixed 1090 LSB/Ga.
// Prints the same lines as the AVR sketch: counts at the gain in effect.
#include <math.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x1e
#define DRIVER_LSB_PER_GAUSS 1090

static const struct device *const compass = DEVICE_DT_GET(DT_NODELABEL(compass));
static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const uint8_t gains[] = {0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0};

static long counts(const struct sensor_value *value)
{
    return lround(sensor_value_to_double(value) * DRIVER_LSB_PER_GAUSS);
}

static void print_reading(const char *prefix, int gain)
{
    struct sensor_value xyz[3];
    if (sensor_sample_fetch(compass) < 0 || sensor_channel_get(compass, SENSOR_CHAN_MAGN_XYZ, xyz) < 0) {
        printk("read failed\n");
        return;
    }
    printk("%s %d %ld %ld %ld\n", prefix, gain, counts(&xyz[0]), counts(&xyz[1]), counts(&xyz[2]));
}

int main(void)
{
    if (!device_is_ready(compass)) {
        printk("library init failed\n");
        return 1;
    }
    printk("sensor 1\n");
    for (int gain = 0; gain < 7; gain++) {
        if (i2c_reg_write_byte(i2c, ADDR, 0x01, gains[gain]) < 0) {
            printk("gain write failed\n");
        }
        k_msleep(250);
        print_reading("gain", gain);
    }
    while (1) {
        print_reading("field", 6);
        k_msleep(500);
    }
    return 0;
}
