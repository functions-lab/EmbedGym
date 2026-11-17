// DRV2605L selftest firmware (ESP32-S3 variant of code/code.ino).
#include <stdint.h>
#include <stdio.h>
#include "driver/i2c.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define ADDR 0x5a
#define TIMEOUT pdMS_TO_TICKS(100)

// Reset values of 0x00..0x20 per the datasheet's register field tables.
static const uint8_t RESET_VALUES[0x21] = {
    0xE0, 0x40, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x05, 0x19, 0xFF, 0x19, 0xFF, 0x3E, 0x8C, 0x0C, 0x6F, 0x36, 0x93, 0xF5, 0xA0, 0x20, 0x80, 0x00,
};
static int64_t t0_us;

static uint32_t now_ms(void)
{
    return (uint32_t)((esp_timer_get_time() - t0_us) / 1000);
}

static void wait_until(uint32_t ms)
{
    while (now_ms() < ms) {
    }
}

static void write_register(uint8_t reg, uint8_t value)
{
    uint8_t out[2] = {reg, value};
    i2c_master_write_to_device(I2C_NUM_0, ADDR, out, sizeof out, TIMEOUT);
}

static uint8_t read_register(uint8_t reg)
{
    uint8_t value = 0;
    i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, &value, 1, TIMEOUT);
    return value;
}

static int reset_mismatches(void)
{
    uint8_t regs[0x21];
    uint8_t start = 0x00;
    i2c_master_write_read_device(I2C_NUM_0, ADDR, &start, 1, regs, sizeof regs, TIMEOUT);
    int mismatches = 0;
    for (int i = 0; i < 0x21; i++) {
        if (regs[i] != RESET_VALUES[i]) mismatches++;
    }
    return mismatches;
}

// Fires GO and polls it every 1 ms; returns the ms until it reads 0.
static uint32_t run_until_go_clears(void)
{
    uint32_t start = now_ms();
    write_register(0x0C, 1);
    while (read_register(0x0C) & 1) esp_rom_delay_us(1000);
    return now_ms() - start;
}

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
    wait_until(50);
    printf("reset %d\n", reset_mismatches());

    wait_until(200);
    write_register(0x01, 0x00);
    write_register(0x03, 0x01);
    write_register(0x1A, read_register(0x1A) & 0x7F);
    write_register(0x1D, read_register(0x1D) | 0x20);
    const uint8_t sequence[] = {10, 0x80 | 20, 47, 0};
    for (int i = 0; i < (int)sizeof sequence; i++) write_register(0x04 + i, sequence[i]);

    wait_until(500);
    printf("seq %u\n", (unsigned)run_until_go_clears());

    wait_until(1000);
    for (int i = 0; i < 8; i++) write_register(0x04 + i, i + 1);
    printf("eight %u\n", (unsigned)run_until_go_clears());

    wait_until(2000);
    write_register(0x04, 47);
    write_register(0x05, 0);
    write_register(0x0C, 1);
    wait_until(2050);
    write_register(0x0C, 0);
    printf("cancel %u\n", read_register(0x0C));

    wait_until(2200);
    write_register(0x01, 0x05);
    write_register(0x02, 0x7F);
    wait_until(2300);
    write_register(0x02, 0x81);
    wait_until(2400);
    write_register(0x1D, read_register(0x1D) | 0x08);
    write_register(0x02, 128);
    wait_until(2500);
    write_register(0x02, 255);
    wait_until(2600);
    write_register(0x01, 0x45);

    wait_until(2700);
    write_register(0x01, 0x00);
    write_register(0x04, 1);
    write_register(0x05, 0);
    write_register(0x0C, 1);
    wait_until(2750);
    write_register(0x01, 0x40);
    printf("standby-go %u\n", read_register(0x0C));

    wait_until(2900);
    write_register(0x01, 0x80);
    printf("dev-reset %d\n", reset_mismatches());

    wait_until(3100);
    write_register(0x01, 0x06);
    uint32_t ms = run_until_go_clears();
    printf("diag %u %u\n", (unsigned)ms, read_register(0x00));

    wait_until(3300);
    write_register(0x01, 0x07);
    ms = run_until_go_clears();
    printf("cal %u %u\n", (unsigned)ms, read_register(0x00));

    while (1) vTaskDelay(pdMS_TO_TICKS(1000));
}
