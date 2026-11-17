// MAX17048 register-level selftest (ESP32-S3 variant of code/code.ino): raw
// I2C on I2C_NUM_0 (SDA GPIO38, SCL GPIO39), INT on GPIO4, QStart on GPIO5.
// Times count from app_main entry. Boot takes part of the power-on acquisition,
// so the defaults section checks its result 300 ms after app start; the
// quickstart section covers the 192 ms acquisition window.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define INT_PIN GPIO_NUM_4
#define QSTART_PIN GPIO_NUM_5
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

static void bus_begin(void)
{
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
}

static esp_err_t write_bytes(uint8_t reg, uint8_t high, uint8_t low, bool both)
{
    uint8_t buf[3] = {reg, high, low};
    return i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, both ? 3 : 2, pdMS_TO_TICKS(100));
}

static void write_word(uint8_t reg, uint16_t value)
{
    check(write_bytes(reg, value >> 8, value & 255, true) == ESP_OK, "write");
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, 2, pdMS_TO_TICKS(100)) == ESP_OK, "read");
    return ((uint16_t)data[0] << 8) | data[1];
}

static esp_err_t address_only(void)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return err;
}

static void drive_bus(uint32_t level)
{
    gpio_set_level(SDA_PIN, level);
    gpio_set_level(SCL_PIN, level);
}

void app_main(void)
{
    t0_us = esp_timer_get_time();
    gpio_reset_pin(INT_PIN);
    gpio_set_direction(INT_PIN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(INT_PIN, GPIO_FLOATING);
    gpio_reset_pin(QSTART_PIN);
    gpio_set_direction(QSTART_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(QSTART_PIN, 0);
    bus_begin();

    check(read_word(0x08) == 0x12, "version");
    check(read_word(0x0a) == 0x8030, "hib-default");
    check(read_word(0x0c) == 0x971c, "config-default");
    check(read_word(0x18) == 0x9648, "vreset-default-id");
    check(read_word(0x1a) == 0x0100, "status-default");
    wait_until(300);
    check(abs((int)read_word(0x02) - 48640) < 20, "voltage-encoding");
    check(read_word(0x04) == 12800, "soc-encoding");
    finish("defaults");

    check(write_bytes(0x0a, 0xff, 0, false) == ESP_OK, "byte-ack");
    check(read_word(0x0a) == 0x8030, "byte-ignored");
    write_word(0x0c, 0x8311);
    check(read_word(0x0c) == 0x8311, "rcomp-athd");
    write_word(0x18, 0x8842);
    check(read_word(0x18) == 0x8848, "id-readonly");
    write_word(0x02, 0);
    check(read_word(0x02) != 0, "vcell-readonly");
    write_word(0x0a, 0x0000);
    finish("word-config");

    write_word(0x06, 0x6000);
    check(read_word(0x06) == 0x2000, "quick-selfclear");
    check(read_word(0x04) == 0, "quick-reacquire");
    delay_ms(300);
    check(read_word(0x04) == 12800, "quick-result");
    gpio_set_level(QSTART_PIN, 1);
    delay_ms(2);
    check(read_word(0x04) == 0, "hardware-quick");
    delay_ms(300);
    check(read_word(0x04) == 12800, "hardware-result");
    gpio_set_level(QSTART_PIN, 0);
    finish("quickstart");

    wait_until(1500);
    write_word(0x14, (195 << 8) | 200);
    delay_ms(300);
    check((read_word(0x1a) & 0x0400) != 0, "low-voltage-status");
    check(gpio_get_level(INT_PIN) == 0, "int-low");
    write_word(0x14, 0x00ff);
    write_word(0x1a, 0);
    check(gpio_get_level(INT_PIN) == 0, "int-latched");
    write_word(0x0c, 0x8311);
    delay_ms(2);
    check(gpio_get_level(INT_PIN) == 1, "int-clear");
    write_word(0x14, 180);
    delay_ms(300);
    check((read_word(0x1a) & 0x0200) != 0, "high-voltage-status");
    write_word(0x14, 0x00ff);
    write_word(0x1a, 0);
    write_word(0x0c, 0x8311);
    finish("voltage-alerts");

    wait_until(3000);
    write_word(0x0c, 0x8351);
    wait_until(4500);
    check((read_word(0x1a) & 0x3000) == 0x3000, "soc-alerts");
    check(gpio_get_level(INT_PIN) == 0, "soc-int");
    write_word(0x1a, 0);
    write_word(0x0c, 0x8351);
    delay_ms(1100);
    check((read_word(0x1a) & 0x3000) == 0, "no-repeat-constant-soc");
    finish("soc-alerts");

    wait_until(6000);
    write_word(0x06, 0x2000);
    write_word(0x0c, 0x8391);
    const uint16_t asleep_soc = read_word(0x04);
    wait_until(7600);
    check(read_word(0x04) == asleep_soc, "sleep-hold");
    write_word(0x0c, 0x8311);
    delay_ms(1100);
    check(read_word(0x04) == 60 * 256, "sleep-wake");
    finish("software-sleep");

    wait_until(9000);
    write_word(0x0a, 0xffff);
    check((read_word(0x06) & 0x1000) != 0, "forced-hibernate");
    const uint16_t held = read_word(0x04);
    wait_until(11500);
    check(read_word(0x04) == held, "hibernate-hold");
    write_word(0x0a, 0);
    delay_ms(1100);
    check(read_word(0x04) == 70 * 256, "hibernate-wake");
    finish("hibernate");

    wait_until(13000);
    check((int16_t)read_word(0x16) == -48, "negative-crate");
    wait_until(15000);
    check((int16_t)read_word(0x16) == 48, "positive-crate");
    finish("crate");

    wait_until(16000);
    write_word(0x18, 0xa048);
    write_word(0x1a, 0x4000);
    wait_until(17500);
    check((read_word(0x1a) & 0x0800) != 0, "vreset-status");
    check(gpio_get_level(INT_PIN) == 0, "vreset-int");
    finish("voltage-reset");

    wait_until(18000);
    write_word(0x06, 0x2000);
    const uint16_t bus_held = read_word(0x04);
    i2c_driver_delete(I2C_NUM_0);
    gpio_set_direction(SDA_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(SCL_PIN, GPIO_MODE_OUTPUT);
    drive_bus(0);
    delay_ms(2800);
    drive_bus(1);
    bus_begin();
    check(read_word(0x04) == bus_held, "bus-sleep-held");
    delay_ms(1100);
    check(read_word(0x08) == 0x12, "bus-sleep-wake");
    check(read_word(0x04) == 90 * 256, "bus-sleep-new-soc");
    finish("bus-sleep");

    wait_until(22500);
    check(address_only() == ESP_FAIL, "disconnected-nack");
    wait_until(23500);
    check(read_word(0x08) == 0x12, "reconnected-version");
    check(read_word(0x04) == 25 * 256, "reconnected-soc");
    finish("battery-power");

    check(write_bytes(0xfe, 0x54, 0, true) == ESP_FAIL, "reset-nack-last-byte");
    check(read_word(0x0c) == 0x971c, "reset-config");
    check(read_word(0x0a) == 0x8030, "reset-hib");
    delay_ms(300);
    check(read_word(0x04) == 25 * 256, "reset-soc");
    finish("reset");
    printf("failures %u\n", failures);
    for (;;) delay_ms(1000);
}
