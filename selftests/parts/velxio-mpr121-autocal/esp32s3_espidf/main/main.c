// MPR121 autoconfiguration selftest (ESP32-S3 port of code/code.ino): raw I2C
// on I2C_NUM_0 (SDA GPIO38, SCL GPIO39) at 0x5A, INT on GPIO4. Times count
// from app_main entry.
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

static unsigned failures = 0;
static unsigned checks = 0;
static int64_t t0_us;

static int64_t millis(void) { return (esp_timer_get_time() - t0_us) / 1000; }
static void delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }
static void until(int64_t when) { while (millis() < when) delay_ms(1); }

static void check(bool valid, const char *name)
{
    checks++;
    if (!valid) {
        printf("FAIL %s\n", name);
        failures++;
    }
}

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    check(i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, 2, pdMS_TO_TICKS(100)) == ESP_OK, "write-ack");
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t data = 0;
    i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, &data, 1, pdMS_TO_TICKS(100));
    return data;
}

static uint16_t read_word(uint8_t reg)
{
    uint8_t data[2] = {0, 0};
    i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, 2, pdMS_TO_TICKS(100));
    return data[0] | (uint16_t)data[1] << 8;
}

static int int_level(void) { return gpio_get_level(INT_PIN); }

static void configure(uint8_t control, uint8_t options)
{
    write_reg(0x80, 0x63); write_reg(0x1e, 20); write_reg(0x5d, 0x20); write_reg(0x41, 12); write_reg(0x42, 6);
    write_reg(0x7b, control); write_reg(0x7c, options); write_reg(0x7d, 200); write_reg(0x7e, 130); write_reg(0x7f, 180); write_reg(0x5e, 0x41);
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
        .master.clk_speed = 400000,
    };
    i2c_param_config(I2C_NUM_0, &conf);
    i2c_driver_install(I2C_NUM_0, I2C_MODE_MASTER, 0, 0, 0);

    for (uint8_t bva = 0; bva < 4; bva++) {
        configure(1 | (bva << 2), 0); delay_ms(80); uint16_t data = read_word(4); uint16_t baseline = (uint16_t)read_reg(0x1e) << 2;
        check(data >= 520 && data <= 800, "auto-physical-range"); check(read_reg(0x5f) > 0, "auto-current"); check(read_reg(2) == 0, "auto-no-oor");
        if (bva == 0) check(baseline == 80, "bva-retain");
        if (bva == 1) check(baseline == 0, "bva-clear");
        if (bva == 2) check(baseline % 8 == 0 && baseline <= data && data - baseline < 8, "bva-high-five");
        if (bva == 3) check(baseline <= data && data - baseline < 4, "bva-all-ten");
    }
    for (uint8_t code = 0; code < 4; code++) {
        configure((code << 6) | (code << 4) | 0x0d, 0x80); delay_ms(80);
        check(read_reg(0x5f) > 16, "auto-ffi-retry-current"); check(read_reg(0x6c) == 0, "scts-preserved-cdt"); check((read_reg(3) & 0xc0) == 0, "auto-flags-clear");
    }
    configure(0x0f, 0); write_reg(0x5e, 0); write_reg(0x2b, 1); write_reg(0x2c, 16); write_reg(0x5e, 0xc1); delay_ms(80);
    uint8_t current = read_reg(0x5f); uint8_t baseline = read_reg(0x1e);
    until(1100); check(read_word(4) < 520 && (read_word(0) & 1), "held-below-lsl");
    check(read_reg(0x5f) == current && read_reg(0x1e) == baseline && read_reg(2) == 0, "are-preserves-touch");
    until(1450); check((read_word(0) & 1) == 0, "auto-touch-release");
    until(1650); check(read_reg(0x5f) < current && read_word(4) >= 520 && read_word(4) <= 800, "are-baseline-drift-retunes");
    until(1800); configure(0xff, 0x87); delay_ms(100);
    check(int_level() == 0, "fault-irq"); check(read_reg(2) == 1 && (read_reg(3) & 0xc0) == 0xc0, "auto-retry-failure-flags");
    delay_ms(5); check(int_level() == 0, "fault-irq-reassert");
    until(2300); check(read_reg(2) == 0 && (read_reg(3) & 0x40) == 0, "are-recovery"); check(read_reg(0x5f) > 16, "are-recovery-physical-current");
    printf("checks %u\nfailures %u\n", checks, failures);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
