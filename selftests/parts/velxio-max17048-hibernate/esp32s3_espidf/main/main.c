// MAX17048 forced-hibernate selftest (ESP32-S3 variant of code/code.ino): raw
// I2C on I2C_NUM_0 (SDA GPIO38, SCL GPIO39). Times count from app_main entry.
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include "driver/i2c.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define ADDR 0x36

static uint16_t failures = 0;
static uint16_t section_start = 0;
static int64_t t0_us;

static int64_t millis(void) { return (esp_timer_get_time() - t0_us) / 1000; }
static void delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }
static void wait_until(int64_t at) { while (millis() < at) delay_ms(1); }

static void check(bool ok, const char *name)
{
    if (!ok) {
        failures++;
        printf("FAIL %s\n", name);
    }
}

static void finish(const char *name)
{
    printf("%s %u\n", name, failures - section_start);
    section_start = failures;
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, 2, pdMS_TO_TICKS(100)) == ESP_OK, "read");
    return ((uint16_t)data[0] << 8) | data[1];
}

static void write_word(uint8_t reg, uint16_t value)
{
    uint8_t buf[3] = {reg, value >> 8, value & 255};
    check(i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, 3, pdMS_TO_TICKS(100)) == ESP_OK, "write");
}

static bool hibernating(void) { return (read_word(0x06) & 0x1000) != 0; }
static bool voltage(float expected) { return fabsf(read_word(0x02) * 0.000078125f - expected) < 0.002f; }

void app_main(void)
{
    t0_us = esp_timer_get_time();
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

    wait_until(1000);
    check(!hibernating(), "active-at-start");
    check(read_word(0x04) == 50 * 256 && voltage(3.8f), "entry-values");
    write_word(0x0a, 0xffff);
    check(hibernating(), "forced-entry");
    wait_until(45000);
    check(read_word(0x04) == 50 * 256 && voltage(3.8f), "forced-45-second-hold");
    finish("forced-hold");
    wait_until(47000);
    check(hibernating(), "forced-ignores-activity");
    check(read_word(0x04) == 70 * 256 && voltage(4.0f), "forced-45-second-update");
    write_word(0x0a, 0);
    check(!hibernating(), "forced-wake");
    finish("forced-update");
    printf("failures %u\n", failures);
    for (;;) delay_ms(1000);
}
