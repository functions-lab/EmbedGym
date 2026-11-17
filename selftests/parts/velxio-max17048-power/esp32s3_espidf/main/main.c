// MAX17048 battery-power selftest (ESP32-S3 variant of code/code.ino): raw
// I2C on I2C_NUM_0 (SDA GPIO38, SCL GPIO39), INT on GPIO4. Times count from
// app_main entry.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define INT_PIN GPIO_NUM_4
#define ADDR 0x36

static uint16_t failures = 0;
static int64_t t0_us;

static int64_t millis(void) { return (esp_timer_get_time() - t0_us) / 1000; }
static void delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }

static void check(bool ok, const char *name)
{
    if (!ok) {
        failures++;
        printf("FAIL %s\n", name);
    }
}

static esp_err_t scan(void)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return err;
}

void app_main(void)
{
    t0_us = esp_timer_get_time();
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

    check(scan() == ESP_FAIL, "no-battery-nack");
    check(gpio_get_level(INT_PIN) == 1, "unpowered-int-released");
    printf("unpowered %u\n", failures);
    while (millis() < 1500) delay_ms(1);
    check(scan() == ESP_OK, "battery-insertion-ack");
    check(gpio_get_level(INT_PIN) == 1, "powered-int-released");
    uint8_t reg = 0x04;
    uint8_t data[2] = {0, 0};
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, 2, pdMS_TO_TICKS(100)) == ESP_OK, "soc-read");
    check((((uint16_t)data[0] << 8) | data[1]) == 50 * 256, "soc-ready");
    printf("failures %u\n", failures);
    for (;;) delay_ms(1000);
}
