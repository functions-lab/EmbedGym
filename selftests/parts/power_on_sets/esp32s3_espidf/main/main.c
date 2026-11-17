// Reads the parts' power-on measurements: the MLX90614 at app start, the
// HMC5883L's idle single-measurement result 100 ms later.
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"

#define TIMEOUT pdMS_TO_TICKS(100)

static int mlx_word(uint8_t command)
{
    uint8_t reply[3] = {0};
    i2c_master_write_read_device(I2C_NUM_0, 0x5a, &command, 1, reply, 3, TIMEOUT);
    return reply[0] | (reply[1] << 8);
}

void app_main(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = GPIO_NUM_38,
        .scl_io_num = GPIO_NUM_39,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 100000,
    };
    i2c_param_config(I2C_NUM_0, &conf);
    i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0);

    int object = mlx_word(0x07);
    int ambient = mlx_word(0x06);
    printf("mlx %d %d\n", object, ambient);

    vTaskDelay(pdMS_TO_TICKS(100));
    uint8_t reg = 0x03, data[6] = {0};
    i2c_master_write_read_device(I2C_NUM_0, 0x1e, &reg, 1, data, 6, TIMEOUT);
    int16_t x = (int16_t)(data[0] << 8 | data[1]);
    int16_t z = (int16_t)(data[2] << 8 | data[3]);
    int16_t y = (int16_t)(data[4] << 8 | data[5]);
    printf("hmc %d %d %d\n", x, y, z);
}
