// MPR121 unpowered selftest (ESP32-S3 port of code/code.ino): raw I2C on
// I2C_NUM_0 (SDA GPIO38, SCL GPIO39); every address, a write and a read
// must be NACKed.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define INT_PIN GPIO_NUM_4

static bool probe(uint8_t address)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (address << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return err == ESP_OK;
}

void app_main(void)
{
    gpio_reset_pin(INT_PIN);
    gpio_set_direction(INT_PIN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(INT_PIN, GPIO_FLOATING);
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = SDA_PIN,
        .scl_io_num = SCL_PIN,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 100000,
    };
    i2c_param_config(I2C_NUM_0, &conf);
    i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0);

    unsigned failures = 0;
    for (uint8_t address = 0x5a; address <= 0x5d; address++) if (probe(address)) failures++;
    uint8_t reset[2] = {0x80, 0x63};
    if (i2c_master_write_to_device(I2C_NUM_0, 0x5a, reset, 2, pdMS_TO_TICKS(100)) == ESP_OK) failures++;
    uint8_t data;
    if (i2c_master_read_from_device(I2C_NUM_0, 0x5a, &data, 1, pdMS_TO_TICKS(100)) == ESP_OK) failures++;
    printf("failures %u\n", failures);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
