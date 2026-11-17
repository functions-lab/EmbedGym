// AMG8833 library selftest (ESP32-S3 variant of code/code.ino, which uses
// Adafruit_AMG88xx; there is no ESP-IDF port of it, so this replays its bus
// traffic): begin() probes the address, writes PCTL normal, initial reset,
// INTC from its cached copy and FPSC 10 fps, then waits 100 ms. INTC writes
// keep the library's cached INTEN/INTMOD bits. INT on GPIO4.
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
static uint8_t intc = 0;
static float pixels[64];
static uint8_t raw[128];

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

static bool probe(void)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(I2C_NUM_0, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return err == ESP_OK;
}

static void write8(uint8_t reg, uint8_t value)
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
    uint8_t value;
    read_bytes(reg, &value, 1);
    return value;
}

static bool begin(void)
{
    if (!probe()) return false;
    write8(0x00, 0x00);
    write8(0x01, 0x3f);
    intc &= ~1;
    write8(0x03, intc);
    write8(0x02, 0x00);
    vTaskDelay(pdMS_TO_TICKS(100));
    return true;
}

static float read_thermistor(void)
{
    uint8_t data[2];
    read_bytes(0x0e, data, 2);
    uint16_t value = ((uint16_t)data[1] << 8) | data[0];
    float magnitude = value & 0x7ff;
    return ((value & 0x800) ? -magnitude : magnitude) * 0.0625f;
}

static void read_pixels(float *out, uint8_t count)
{
    uint8_t data[128];
    read_bytes(0x80, data, 2 * count);
    for (uint8_t i = 0; i < count; i++) {
        int16_t value = (int16_t)((((uint16_t)data[2 * i + 1] << 8) | data[2 * i]) << 4) >> 4;
        out[i] = value * 0.25f;
    }
}

static void read_pixels_raw(uint8_t *out, uint8_t count) { read_bytes(0x80, out, 2 * count); }

static void set_interrupt_levels(float high, float low, float hysteresis)
{
    int high_conv = high / 0.25f;
    int low_conv = low / 0.25f;
    int hys_conv = hysteresis / 0.25f;
    write8(0x08, high_conv & 0xff); write8(0x09, (high_conv & 0x0f00) >> 8);
    write8(0x0a, low_conv & 0xff); write8(0x0b, (low_conv & 0x0f00) >> 8);
    write8(0x0c, hys_conv & 0xff); write8(0x0d, (hys_conv & 0x0f00) >> 8);
}

static void set_interrupt_mode(uint8_t absolute) { intc = (intc & 1) | (absolute << 1); write8(0x03, intc); }
static void enable_interrupt(void) { intc |= 1; write8(0x03, intc); }
static void disable_interrupt(void) { intc &= ~1; write8(0x03, intc); }
static void clear_interrupt(void) { write8(0x01, 0x30); }
static void set_moving_average(bool on) { write8(0x07, on ? 0x20 : 0); }
static void get_interrupt(uint8_t *out, uint8_t count) { read_bytes(0x10, out, count); }

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

    check(begin(), "stock-begin"); vTaskDelay(pdMS_TO_TICKS(210));
    check(read_thermistor() == -12.0625f, "stock-signed-thermistor");
    read_pixels(pixels, 64); read_pixels_raw(raw, 64);
    for (uint8_t i = 0; i < 64; i++) {
        check(pixels[i] == 25 && raw[2 * i] == 100 && raw[2 * i + 1] == 0, "stock-full-array");
    }
    finish("stock-init");

    until(1250); read_pixels(pixels, 64); read_pixels_raw(raw, 64);
    for (uint8_t i = 0; i < 64; i++) {
        int value = raw[2 * i] | (raw[2 * i + 1] << 8);
        if (value & 0x800) value -= 4096;
        check(pixels[i] == (i - 32) * .25f && value == i - 32, "stock64-independent-pixels");
    }
    check(read_thermistor() == 30.0625f, "stock-fresh-thermistor");
    read_pixels(pixels, 7); read_pixels_raw(raw, 7);
    check(pixels[6] == -6.5f && raw[12] == 230, "stock-partial-array");
    set_moving_average(true); check(read_reg(7) == 32, "stock-average-on");
    until(1800); read_pixels(pixels, 64); check(pixels[0] == 25 && pixels[63] == 25, "stock-average-settled");
    set_moving_average(false); check(read_reg(7) == 0, "stock-average-off");
    finish("stock-data-average");

    set_interrupt_levels(30, 10, 30 * .95); check(read_reg(12) == 114, "stock-default-hysteresis");
    set_interrupt_levels(30, 10, 25); set_interrupt_mode(1); clear_interrupt(); enable_interrupt();
    until(2250); uint8_t bitmap[8]; get_interrupt(bitmap, 8);
    check(bitmap[0] == 1 && bitmap[7] == 0 && gpio_get_level(INT_PIN) == 0, "stock-upper-table-and-INT");
    disable_interrupt(); delay_ms(1); check(gpio_get_level(INT_PIN) == 1 && (read_reg(4) & 2), "stock-disable-mask");
    enable_interrupt(); delay_ms(1); check(gpio_get_level(INT_PIN) == 0, "stock-reenable-latch");
    clear_interrupt(); delay_ms(1); check(read_reg(4) == 0 && gpio_get_level(INT_PIN) == 1, "stock-clear-interrupt");
    until(2750); clear_interrupt();
    set_interrupt_levels(4, -4, 0); set_interrupt_mode(0); clear_interrupt();
    until(3150); get_interrupt(bitmap, 8); check(bitmap[7] == 128, "stock-difference-mode");
    get_interrupt(bitmap, 1); check(bitmap[0] == 0, "stock-partial-bitmap");
    until(3350); clear_interrupt(); vTaskDelay(pdMS_TO_TICKS(150)); check(read_reg(4) == 0, "stock-difference-recovery");
    finish("stock-interrupts");
    printf("failures %u\n", failures);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
