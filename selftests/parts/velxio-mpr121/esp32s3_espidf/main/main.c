// MPR121 register-level selftest (ESP32-S3 port of code/code.ino): raw I2C on
// I2C_NUM_0 (SDA GPIO38, SCL GPIO39) at 0x5A, INT on GPIO4. Times count from
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
#define ADDR 0x5a

static uint16_t failures = 0;
static int64_t t0_us;

static int64_t millis(void) { return (esp_timer_get_time() - t0_us) / 1000; }
static void delay_ms(uint32_t ms) { int64_t end = esp_timer_get_time() + ms * 1000LL; while (esp_timer_get_time() < end) {} }
static void until(int64_t at_ms) { while (millis() < at_ms) vTaskDelay(1); }

static void check(bool condition, const char *name)
{
    if (!condition) {
        failures++;
        printf("FAIL ");
        for (const char *c = name; *c; c++) putchar(*c == ' ' ? '-' : *c);
        printf("\n");
    }
}

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    check(i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, 2, pdMS_TO_TICKS(100)) == ESP_OK, "I2C write");
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t data = 0;
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, &data, 1, pdMS_TO_TICKS(100)) == ESP_OK, "I2C read");
    return data;
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, 2, pdMS_TO_TICKS(100)) == ESP_OK, "I2C word");
    return data[0] | (uint16_t)data[1] << 8;
}

static int int_level(void) { return gpio_get_level(INT_PIN); }
static void stop(void) { write_reg(0x5e, 0); }
static void start(uint8_t ecr) { write_reg(0x5e, ecr); delay_ms(80); }
static void reset(void) { write_reg(0x80, 0x63); delay_ms(1); write_reg(0x5d, 0x20); }

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

    reset(); check(read_reg(0x5c) == 0x10 && read_reg(0x5e) == 0, "reset");
    write_reg(0x41, 12); write_reg(0x42, 6); start(0xc1);
    printf("init-data %u baseline %u config %u ecr %u\n", read_word(4), read_reg(0x1e), read_reg(0x5d), read_reg(0x5e));
    check(read_word(4) == 165, "physical units"); check(read_reg(0x1e) == 41, "baseline");
    check(read_word(0) == 0, "initial release"); check(int_level() == 1, "IRQ pull");
    until(650); check(int_level() == 0, "touch IRQ"); check(read_word(0) == 1, "physical touch");
    check(int_level() == 1, "address clears IRQ"); check(read_word(4) == 99, "contact capacitance");
    until(850); check(read_word(0) == 1, "held touch");
    until(1050); check(int_level() == 0, "release IRQ"); check(read_word(0) == 0, "release");
    stop(); write_reg(0x1e, 100); start(0x41); check(read_reg(0x1e) == 100, "baseline lock");
    stop(); write_reg(0x5f, 32); write_reg(0x6c, 2); start(0xc1); check(read_word(4) == 661, "individual CDC CDT");
    stop(); write_reg(0x5f, 0); write_reg(0x6c, 0); write_reg(0x5c, 0); start(0xc1); check(read_word(4) == 0, "disabled current");
    stop(); write_reg(0x5c, 16); write_reg(0x5d, 0); start(0xc1); check(read_word(4) == 0, "disabled charge time");
    reset(); start(0xdc); check(read_word(0x1c) == 82, "two-electrode proximity");
    stop(); start(0xec); check(read_word(0x1c) == 41, "four-electrode proximity");
    stop(); start(0xfc); check(read_word(0x1c) == 13, "twelve-electrode proximity");
    reset(); write_reg(0x2b, 5); write_reg(0x2c, 1); write_reg(0x2d, 1); write_reg(0x41, 255); write_reg(0x42, 255); start(0xc1);
    until(1900); check(read_word(4) > 165, "physical drift"); check(read_reg(0x1e) >= 41, "baseline rising");
    stop(); write_reg(0x5b, 0x77); check(read_reg(0x5b) == 0x77, "max debounce");
    reset(); write_reg(0x5b, 0x77); write_reg(0x5c, 0xd0); write_reg(0x5d, 0xff); start(0xcf);
    check(read_word(4) == 0 && read_word(0x1a) == 0, "scan filter timing"); vTaskDelay(pdMS_TO_TICKS(2500));
    check(read_word(4) == 1023 && read_word(0x1a) == 1023, "FFI SFI ESI and count 15");
    reset(); start(0xc1);
    until(6000); check((read_reg(1) & 0x80) != 0, "overcurrent"); check((read_reg(0x5e) & 63) == 0, "fault stops");
    check(read_word(4) == 0, "fault clears data"); write_reg(0x5e, 0xc1); check((read_reg(0x5e) & 63) == 0, "fault rejects run");
    until(6300); write_reg(1, 0x80); start(0xc1); check(read_word(4) == 165, "fault recovery");
    printf("failures %u\n", failures);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
