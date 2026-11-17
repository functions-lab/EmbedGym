// MPR121 GPIO/LED selftest (ESP32-S3 port of code/code.ino): raw I2C on
// I2C_NUM_0 (SDA GPIO38, SCL GPIO39) at 0x5A. Electrodes 4..11 read back on
// GPIO5, 6, 7, 15, 16, 17, 18, 21 (electrode 4 through a 10k/100k divider).
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
#define ADDR 0x5a

static const gpio_num_t PINS[8] = {GPIO_NUM_5, GPIO_NUM_6, GPIO_NUM_7, GPIO_NUM_15, GPIO_NUM_16, GPIO_NUM_17, GPIO_NUM_18, GPIO_NUM_21};
static unsigned failures = 0;
static unsigned checks = 0;

static int64_t micros(void) { return esp_timer_get_time(); }
static void delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }

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

static bool high(uint8_t i) { return gpio_get_level(PINS[i]) == 1; }
static void input(uint8_t i) { gpio_set_direction(PINS[i], GPIO_MODE_INPUT); }
static void settle(void) { delay_ms(2); }
static void level(uint8_t i, bool expected, const char *name) { settle(); check(high(i) == expected, name); }

void app_main(void)
{
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
    for (uint8_t i = 0; i < 8; i++) {
        gpio_reset_pin(PINS[i]);
        gpio_set_pull_mode(PINS[i], GPIO_FLOATING);
        input(i);
    }

    write_reg(0x80, 0x63); write_reg(0x76, 0xff); write_reg(0x75, 0); write_reg(0x77, 0xff);
    for (uint8_t i = 0; i < 8; i++) { write_reg(0x78, 1 << i); level(i, true, "pushpull-high"); write_reg(0x79, 1 << i); level(i, false, "pushpull-low"); }
    write_reg(0x7a, 0xff); settle(); check(read_reg(0x75) == 0xff, "toggle-data");
    write_reg(0x7a, 0xff); settle(); check(read_reg(0x78) == 0, "toggle-clear");
    write_reg(0x77, 0); write_reg(0x76, 0); gpio_set_direction(PINS[0], GPIO_MODE_OUTPUT); gpio_set_level(PINS[0], 0);
    write_reg(0x77, 1); settle(); check((read_reg(0x75) & 1) == 0, "divided-input-low");
    gpio_set_level(PINS[0], 1); settle(); check((read_reg(0x75) & 1) == 1, "divided-input-high");
    write_reg(0x77, 0); input(0);
    write_reg(0x73, 0xf0); write_reg(0x74, 0xf0); write_reg(0x77, 0xf0); settle(); check((read_reg(0x75) & 0xf0) == 0xf0, "input-pullup");
    write_reg(0x73, 0); settle(); check((read_reg(0x75) & 0xf0) == 0, "input-pulldown"); write_reg(0x77, 0);
    write_reg(0x74, 4); write_reg(0x76, 4); write_reg(0x75, 4); write_reg(0x77, 4); level(2, true, "low-drain-release"); write_reg(0x79, 4); level(2, false, "low-drain-active"); write_reg(0x78, 4); level(2, true, "low-drain-rerelease");
    write_reg(0x77, 0); write_reg(0x73, 8); write_reg(0x74, 8); write_reg(0x76, 8); write_reg(0x75, 0); write_reg(0x77, 8); level(3, false, "high-drain-release"); write_reg(0x78, 8); level(3, true, "high-drain-active"); write_reg(0x79, 8); level(3, false, "high-drain-rerelease");
    write_reg(0x77, 0); write_reg(0x73, 0); write_reg(0x74, 0); write_reg(0x76, 0xff); write_reg(0x75, 0xff); write_reg(0x77, 0xff);
    for (uint8_t code = 1; code <= 15; code++) {
        write_reg(0x81, code | (code << 4)); write_reg(0x82, code | (code << 4)); write_reg(0x83, code | (code << 4)); write_reg(0x84, code | (code << 4)); delay_ms(20);
        unsigned edges[8] = {0}; unsigned highs[8] = {0}; bool previous[8];
        for (uint8_t i = 0; i < 8; i++) previous[i] = high(i);
        unsigned samples = 0; int64_t start = micros();
        while (micros() - start < 64000) {
            for (uint8_t i = 0; i < 8; i++) { bool h = high(i); highs[i] += h; if (h != previous[i]) { edges[i]++; previous[i] = h; } }
            samples++;
        }
        for (uint8_t i = 0; i < 8; i++) {
            check(edges[i] >= 14 && edges[i] <= 18, "pwm-125hz");
            float duty = (float)highs[i] / samples; check(duty > (float)code / 16 - 0.03f && duty < (float)code / 16 + 0.03f, "pwm-duty");
        }
    }
    for (uint8_t reg = 0x81; reg <= 0x84; reg++) write_reg(reg, 0);
    delay_ms(10);
    for (uint8_t i = 0; i < 8; i++) check(high(i), "pwm-zero-steady");
    write_reg(0x79, 0xff); settle(); for (uint8_t i = 0; i < 8; i++) check(!high(i), "pwm-zero-data");
    write_reg(0x75, 0xff); write_reg(0x5d, 0x20); write_reg(0x5e, 0xc5); level(0, false, "sensing-overrides-gpio");
    write_reg(0x5e, 0xc4); level(0, true, "sensing-restores-gpio");
    write_reg(0x5e, 0xf4); level(0, false, "proximity-overrides-gpio");
    write_reg(0x5e, 0xd4); level(0, true, "short-proximity-keeps-gpio");
    write_reg(0x5e, 0); write_reg(0x5c, 0xd0); write_reg(0x5d, 0xe0);
    for (uint8_t reg = 0x81; reg <= 0x84; reg++) write_reg(reg, 0x88);
    write_reg(0x5e, 0xc1); delay_ms(30);
    unsigned transitions = 0; bool jitter = false; bool previous = high(1); int64_t start = micros(), last = start;
    while (micros() - start < 100000) {
        bool h = high(1);
        if (h != previous) {
            int64_t now = micros();
            if (transitions) { int64_t gap = now - last; if (gap < 3800 || gap > 4200) jitter = true; check(gap >= 2000 && gap <= 6500, "conversion-deferred-edge"); }
            transitions++; last = now; previous = h;
        }
    }
    check(transitions >= 20 && transitions <= 28 && jitter, "conversion-inhibits-pwm");
    write_reg(0x5e, 0);
    printf("checks %u\nfailures %u\n", checks, failures);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
