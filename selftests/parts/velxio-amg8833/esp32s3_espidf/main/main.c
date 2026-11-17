// AMG8833 register-level selftest (ESP32-S3 variant of code/code.ino): raw
// I2C on I2C_NUM_0 (SDA GPIO38, SCL GPIO39) at 0x69, INT on GPIO4. Times
// count from app_main entry.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define INT_PIN GPIO_NUM_4
#define ADDR 0x69

static uint16_t failures = 0;
static uint16_t section_start = 0;
static int64_t t0_us;

static int64_t millis(void) { return (esp_timer_get_time() - t0_us) / 1000; }
static void delay_ms(uint32_t ms) { esp_rom_delay_us(ms * 1000); }
static void until(int64_t at_ms) { while (millis() < at_ms) vTaskDelay(1); }

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

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    check(i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, 2, pdMS_TO_TICKS(100)) == ESP_OK, "I2C-write");
}

static void read_bytes(uint8_t reg, uint8_t *data, size_t size)
{
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, size, pdMS_TO_TICKS(100)) == ESP_OK,
          "I2C-read");
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t data;
    read_bytes(reg, &data, 1);
    return data;
}

static int pixel(uint8_t index)
{
    uint8_t data[2];
    read_bytes(0x80 + 2 * index, data, 2);
    int value = data[0] | ((data[1] & 15) << 8);
    return value & 0x800 ? value - 4096 : value;
}

static float thermistor(void)
{
    uint8_t data[2];
    read_bytes(0x0e, data, 2);
    int value = data[0] | (data[1] << 8);
    return ((value & 0x800) ? -(value & 0x7ff) : value) / 16.0f;
}

static void levels(int high, int low, int hysteresis)
{
    write_reg(8, high & 255); write_reg(9, (high >> 8) & 15);
    write_reg(10, low & 255); write_reg(11, (low >> 8) & 15);
    write_reg(12, hysteresis & 255); write_reg(13, (hysteresis >> 8) & 15);
}

static void clear(void) { write_reg(5, 6); }
static int int_level(void) { return gpio_get_level(INT_PIN); }

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
        .master.clk_speed = 400000,
    };
    i2c_param_config(I2C_NUM_0, &conf);
    i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0);

    check(read_reg(0) == 0 && read_reg(2) == 0 && read_reg(3) == 0, "defaults");
    until(220);
    for (uint8_t i = 0; i < 64; i++) check(pixel(i) == i - 32, "all64-signed-pixels");
    check(thermistor() == -12.0625f, "signed-independent-thermistor");
    finish("encoding");

    write_reg(2, 0xfe); write_reg(3, 0xfe); write_reg(9, 0xf0);
    check(read_reg(2) == 0 && read_reg(3) == 2 && read_reg(9) == 0, "unused-bit-masks");
    until(1750); check(pixel(0) == 100 && pixel(63) == 100, "physical-frame-inputs");
    until(1900); write_reg(2, 1); write_reg(7, 0x20);
    until(2800); check(pixel(0) == 100, "one-fps-not-early");
    until(3050); check(pixel(0) == 120 && thermistor() == 25, "two-frame-average");
    until(4050); check(pixel(0) == 140, "average-settles");
    write_reg(0x1f, 0x50); write_reg(0x1f, 0x45); write_reg(0x1f, 0x57); write_reg(7, 0); write_reg(0x1f, 0);
    check(read_reg(7) == 0, "vendor-average-sequence");
    finish("frame-average");

    until(4300); write_reg(0, 0x10); write_reg(2, 0); write_reg(1, 0x3f);
    until(4700); write_reg(0, 0); delay_ms(51); write_reg(1, 0x3f); delay_ms(3); write_reg(1, 0x30);
    check(read_reg(2) == 1 && read_reg(3) == 2 && read_reg(7) == 0, "wake-config-retained");
    check(pixel(0) == 0, "initial-reset-pixel-clear");
    until(5800); check(pixel(0) == 180 && thermistor() == 5.5f, "wake-fresh-inputs");
    write_reg(1, 0x30); check(pixel(0) == 180, "flag-reset-data-retained");
    finish("sleep-reset");

    until(6005); write_reg(2, 0); levels(120, 40, 100); write_reg(3, 3);
    until(6200); clear();
    until(6650); check(read_reg(0x17) == 128 && int_level() == 0, "upper-pixel63-INT");
    clear(); until(6850); check((read_reg(4) & 2) && int_level() == 0, "clear-reasserts");
    until(7150); clear(); until(7250); check(read_reg(0x17) == 128, "upper-hysteresis-hold");
    until(7650); clear(); until(7750); check(read_reg(4) == 0 && int_level() == 1, "upper-inclusive-recovery");
    until(8150); check(read_reg(0x10) == 2 && int_level() == 0, "lower-pixel1-INT");
    until(8650); clear(); until(8750); check(read_reg(0x10) == 2, "lower-hysteresis-hold");
    until(9150); clear(); until(9250); check(read_reg(4) == 0, "lower-inclusive-recovery");
    write_reg(3, 2);
    until(9650); check(read_reg(0x10) == 4 && int_level() == 1, "INT-output-mask-retains-table");
    write_reg(3, 3); delay_ms(1); check(int_level() == 0, "INT-enable-latched");
    until(10150); clear(); until(10250); check(read_reg(4) == 0, "exact-upper-limit");
    finish("interrupts");

    levels(16, -16, 0); write_reg(3, 1); clear();
    until(10650); check(read_reg(0x10) == 8, "difference-upper");
    until(11050); check(read_reg(0x17) == 16, "difference-lower");
    until(11150); clear(); until(11250); check(read_reg(4) == 0, "difference-clears");
    until(11650); clear(); until(11750); check(read_reg(4) == 0, "difference-stable-recovers");
    finish("difference");

    until(12150); check((read_reg(4) & 4) != 0, "ADC-fault");
    write_reg(5, 4); check((read_reg(4) & 4) == 0, "ADC-selective-clear");
    until(12250); check((read_reg(4) & 4) != 0, "ADC-fault-reassert");
    until(13150); write_reg(1, 0x30); until(13250); check((read_reg(4) & 4) == 0, "ADC-fault-recovery");
    finish("ADC-fault");

    until(13500); levels(120, 40, 100); write_reg(3, 3); write_reg(7, 0x20); write_reg(2, 1); write_reg(1, 0x3f);
    check(read_reg(3) == 3 && read_reg(7) == 0x20 && read_reg(2) == 1 && read_reg(8) == 120,
          "initial-reset-retains-config");
    delay_ms(3); write_reg(1, 0x30); until(15600); check(pixel(0) == 100, "initial-reset-frames");
    write_reg(7, 0); write_reg(2, 0); write_reg(3, 2);
    until(16500); write_reg(0, 0x20); clear();
    until(76000); check(pixel(62) == 100, "standby60-not-early");
    until(76750); check(pixel(62) == 160 && (read_reg(0x17) & 64), "standby60-frame-and-table");
    write_reg(0, 0x21); clear();
    until(86500); check(pixel(62) == 160, "standby10-not-early");
    until(87000); check(pixel(62) == 180 && (read_reg(0x17) & 64), "standby10-frame");
    write_reg(0, 0); until(87250); check(pixel(62) == 180, "standby-normal-return");
    finish("standby-reset");
    printf("failures %u\n", failures);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
