// MPR121 library selftest (ESP32-S3 variant of code/code.ino, which uses
// Adafruit_MPR121 1.2.1; there is no ESP-IDF port of it, so this replays its
// bus traffic): begin() probes the address, soft-resets, stops, checks
// CONFIG2, writes the thresholds, baseline filters, debounce, CONFIG1/2 and
// autoconfiguration off (begin's default), then runs 12 electrodes. Every register write outside
// ECR and the GPIO block saves ECR, stops, writes and restores ECR, as the
// library does. INT on GPIO4. Times count from app_main entry.
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
#define ADDRESS 0x5d

static unsigned failures = 0;
static int64_t t0_us;

static int64_t millis(void) { return (esp_timer_get_time() - t0_us) / 1000; }
static void until(int64_t at_ms) { while (millis() < at_ms) vTaskDelay(1); }

static void check(bool valid, const char *name)
{
    if (!valid) {
        printf("FAIL %s\n", name);
        failures++;
    }
}

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

static void raw_write(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    i2c_master_write_to_device(I2C_NUM_0, ADDRESS, buf, 2, pdMS_TO_TICKS(100));
}

static uint16_t read_register(uint8_t reg, size_t width)
{
    uint8_t data[2] = {0, 0};
    i2c_master_write_read_device(I2C_NUM_0, ADDRESS, &reg, 1, data, width, pdMS_TO_TICKS(100));
    return data[0] | (uint16_t)data[1] << 8;
}

static uint8_t read_register8(uint8_t reg) { return read_register(reg, 1); }

static void write_register(uint8_t reg, uint8_t value)
{
    bool stop_required = !(reg == 0x5e || (0x73 <= reg && reg <= 0x7a));
    uint8_t ecr_backup = read_register8(0x5e);
    if (stop_required) raw_write(0x5e, 0x00);
    raw_write(reg, value);
    if (stop_required) raw_write(0x5e, ecr_backup);
}

static void set_thresholds(uint8_t touch, uint8_t release)
{
    for (uint8_t i = 0; i < 12; i++) {
        write_register(0x41 + 2 * i, touch);
        write_register(0x42 + 2 * i, release);
    }
}

static uint16_t filtered_data(uint8_t t) { return t > 12 ? 0 : read_register(0x04 + t * 2, 2); }
static uint16_t baseline_data(uint8_t t) { return t > 12 ? 0 : (uint16_t)read_register8(0x1e + t) << 2; }
static uint16_t touched(void) { return read_register(0x00, 2) & 0x0fff; }

static bool begin(void)
{
    if (!probe(ADDRESS)) return false;
    write_register(0x80, 0x63);
    vTaskDelay(pdMS_TO_TICKS(1));
    write_register(0x5e, 0x00);
    if (read_register8(0x5d) != 0x24) return false;
    set_thresholds(12, 6);
    write_register(0x2b, 0x01); write_register(0x2c, 0x01); write_register(0x2d, 0x0e); write_register(0x2e, 0x00);
    write_register(0x2f, 0x01); write_register(0x30, 0x05); write_register(0x31, 0x01); write_register(0x32, 0x00);
    write_register(0x33, 0x00); write_register(0x34, 0x00); write_register(0x35, 0x00);
    write_register(0x5b, 0); write_register(0x5c, 0x10); write_register(0x5d, 0x20);
    write_register(0x7b, 0x0a);
    write_register(0x5e, 0x80 + 12);
    return true;
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

    for (uint8_t address = 0x5a; address <= 0x5d; address++) check(probe(address) == (address == ADDRESS), "address-probe");
    check(begin(), "stock-begin"); vTaskDelay(pdMS_TO_TICKS(120));
    for (uint8_t i = 0; i < 12; i++) {
        check(filtered_data(i) == 165, "stock-filtered");
        check(baseline_data(i) >= 160 && baseline_data(i) <= 164, "stock-baseline");
    }
    check(filtered_data(13) == 0 && baseline_data(13) == 0, "stock-channel-guard");
    set_thresholds(80, 70); until(500); check(touched() == 0, "stock-high-threshold");
    until(650); set_thresholds(12, 6);
    check(read_register8(0x41) == 12 && read_register8(0x42) == 6, "stock-threshold-restore");

    uint16_t previous = 0;
    bool done = false;
    for (;;) {
        uint16_t mask = touched();
        if (mask != previous) { printf("mask %u\n", mask); previous = mask; }
        if (!done && millis() >= 4700) {
            done = true; check(mask == 0, "stock-release"); check(gpio_get_level(INT_PIN) == 1, "stock-irq-release");
            printf("failures %u\n", failures);
        }
        vTaskDelay(pdMS_TO_TICKS(2));
    }
}
