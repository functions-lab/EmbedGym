// Reads the parts' power-on measurements: the MLX90614 at app start, the
// HMC5883L's idle single-measurement result 100 ms later.
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/printk.h>

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));

static int mlx_word(uint8_t command)
{
    uint8_t reply[3] = {0};

    i2c_write_read(i2c, 0x5a, &command, 1, reply, 3);
    return reply[0] | (reply[1] << 8);
}

int main(void)
{
    int object = mlx_word(0x07);
    int ambient = mlx_word(0x06);

    printk("mlx %d %d\n", object, ambient);

    k_msleep(100);
    uint8_t reg = 0x03, data[6] = {0};

    i2c_write_read(i2c, 0x1e, &reg, 1, data, 6);
    int16_t x = (int16_t)(data[0] << 8 | data[1]);
    int16_t z = (int16_t)(data[2] << 8 | data[3]);
    int16_t y = (int16_t)(data[4] << 8 | data[5]);

    printk("hmc %d %d %d\n", x, y, z);
    return 0;
}
