#include <stdint.h>
#include <stdio.h>
#include "driver/i2c.h"
#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static void probe(int sda, int scl, uint8_t address)
{
    i2c_config_t config = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = sda,
        .scl_io_num = scl,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 100000,
    };
    ESP_ERROR_CHECK(i2c_param_config(I2C_NUM_0, &config));
    ESP_ERROR_CHECK(i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0));
    uint8_t reg = 0xd0, id = 0;
    esp_err_t result = i2c_master_write_read_device(
        I2C_NUM_0, address, &reg, 1, &id, 1, pdMS_TO_TICKS(20));
    printf("I2C connected: %d\n", result == ESP_OK && id == 0x60);
    ESP_ERROR_CHECK(i2c_driver_delete(I2C_NUM_0));
}

void app_main(void)
{
    probe(38, 39, 0x76);
    probe(1, 39, 0x76);
    probe(38, 2, 0x76);
    probe(39, 38, 0x76);
    probe(38, 39, 0x77);
    probe(38, 39, 0x76);
}
