// HMC5883L register-level selftest (ESP32-S3 variant of code/code.ino):
// raw I2C on I2C_NUM_0 (SDA GPIO38, SCL GPIO39), DRDY on GPIO4 timed by an
// any-edge ISR. Times count from app_main entry. The power-on measurement
// completes before app start here, so the startup section checks its result
// and times the first DRDY pulse on a single measurement instead.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <math.h>
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_attr.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define DRDY_PIN GPIO_NUM_4
#define ADDR 0x1e

static volatile uint16_t pulses = 0;
static volatile int64_t pulse_at = 0;
static volatile int64_t pulse_width = 0;
static uint16_t failures = 0;
static uint16_t section_start = 0;
static int64_t t0_us;
static const int gains[] = {1370, 1090, 820, 660, 440, 390, 330, 230};
static const int64_t periods[] = {1333333, 666667, 333333, 133333, 66667, 33333, 13333};

typedef struct { int16_t x; int16_t y; int16_t z; } axes_t;

static int64_t micros(void) { return esp_timer_get_time() - t0_us; }
static int64_t millis(void) { return micros() / 1000; }
static void delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }

static void IRAM_ATTR ready_edge(void *arg)
{
    if (gpio_get_level(DRDY_PIN) == 0) {
        pulse_at = micros();
        pulses++;
    } else {
        pulse_width = micros() - pulse_at;
    }
}

static void check(bool ok, const char *name)
{
    if (!ok) {
        failures++;
        printf("FAIL %s\n", name);
    }
}

static void finish_section(const char *name)
{
    printf("%s %u\n", name, failures - section_start);
    section_start = failures;
}

static void bus_failure(void)
{
    printf("FAIL bus\n");
    for (;;) delay_ms(1000);
}

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    if (i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, 2, pdMS_TO_TICKS(100)) != ESP_OK) bus_failure();
}

static void read_bytes(uint8_t reg, uint8_t *data, size_t length)
{
    if (i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, data, length, pdMS_TO_TICKS(100)) != ESP_OK) {
        bus_failure();
    }
}

static uint8_t read_reg(uint8_t reg)
{
    uint8_t value;
    read_bytes(reg, &value, 1);
    return value;
}

static axes_t decode(const uint8_t *data)
{
    axes_t a = {(int16_t)(((uint16_t)data[0] << 8) | data[1]),
                (int16_t)(((uint16_t)data[4] << 8) | data[5]),
                (int16_t)(((uint16_t)data[2] << 8) | data[3])};
    return a;
}

static axes_t read_axes(void)
{
    uint8_t data[6];
    read_bytes(3, data, 6);
    return decode(data);
}

static void expect_axes(axes_t value, int x, int y, int z, const char *name)
{
    check(value.x == x && value.y == y && value.z == z, name);
}

static void expect_field_at(axes_t value, int gain, float x, float y, float z)
{
    expect_axes(value, lroundf(x * gain), lroundf(y * gain), lroundf(z * gain), "axis-order-sign-gain");
}

static void expect_field(axes_t value, int gain)
{
    expect_field_at(value, gain, .3f, -.2f, .1f);
}

static int64_t wait_ready(int64_t timeout_us)
{
    int64_t started = micros();
    while ((read_reg(9) & 1) == 0) {
        if (micros() - started > timeout_us) {
            check(false, "ready-timeout");
            return micros();
        }
    }
    return micros();
}

static bool near_time(int64_t elapsed, int64_t wanted, int64_t tolerance)
{
    return elapsed + tolerance >= wanted && elapsed <= wanted + tolerance;
}

static axes_t single(void)
{
    write_reg(2, 1);
    int64_t started = micros();
    wait_ready(15000);
    check(near_time(micros() - started, 6000, 2500), "single-6ms");
    return read_axes();
}

static void idle(void)
{
    write_reg(2, 2);
    read_axes();
}

static void until(int64_t time_ms)
{
    while (millis() < time_ms) delay_ms(1);
}

void app_main(void)
{
    t0_us = esp_timer_get_time();
    gpio_reset_pin(DRDY_PIN);
    gpio_set_direction(DRDY_PIN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(DRDY_PIN, GPIO_FLOATING);
    gpio_set_intr_type(DRDY_PIN, GPIO_INTR_ANYEDGE);
    gpio_install_isr_service(0);
    gpio_isr_handler_add(DRDY_PIN, ready_edge, NULL);

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

    check(read_reg(0) == 0x10 && read_reg(1) == 0x20, "powerup-config");
    check((read_reg(9) & 3) == 1, "powerup-measured");
    check(read_reg(2) == 2, "powerup-single-auto-idle");
    check((read_reg(9) & 2) != 0, "mode-read-locks");
    write_reg(0, 0x30);
    check((read_reg(9) & 3) == 1, "CRA-unlocks-startup");
    expect_field(read_axes(), 1090);
    check((read_reg(9) & 3) == 0, "read-clears-ready-lock");
    check(pulses == 0, "powerup-DRDY-before-app");
    expect_field(single(), 1090);
    check(read_reg(2) == 2, "single-auto-idle");
    read_axes();
    delay_ms(1);
    check(pulses == 1 && gpio_get_level(DRDY_PIN) == 1, "startup-DRDY");
    check(pulse_width >= 230 && pulse_width <= 280, "DRDY-250us");
    finish_section("startup");

    uint8_t ids[4];
    read_bytes(10, ids, 4);
    check(ids[0] == 'H' && ids[1] == '4' && ids[2] == '3' && ids[3] == 0x30, "IDs-pointer-wrap");
    write_reg(0, 0xb0);
    check(read_reg(0) == 0x30, "CRA-reserved-bit");
    write_reg(1, 0x3f);
    check(read_reg(1) == 0x20, "CRB-reserved-bits");
    write_reg(2, 0xfe);
    check(read_reg(2) == 0x82, "mode-HS-reserved-bits");
    read_axes();
    write_reg(0x20, 0xaa);
    check(read_reg(0x20) == 0, "reserved-register");
    write_reg(10, 0xff);
    check(read_reg(10) == 'H', "IDs-read-only");
    finish_section("registers");

    for (uint8_t average = 0; average < 4; average++) {
        uint8_t config = (average << 5) | 0x10;
        write_reg(0, config);
        check(read_reg(0) == config, "averaging-readback");
        expect_field(single(), 1090);
    }
    finish_section("averaging");

    uint8_t previous_gain = 1;
    for (uint8_t gain = 0; gain < 8; gain++) {
        write_reg(1, gain << 5);
        check(read_reg(1) == (gain << 5), "gain-readback");
        expect_field(single(), gains[previous_gain]);
        expect_field(single(), gains[gain]);
        previous_gain = gain;
    }
    finish_section("gains");

    write_reg(1, 0x20);
    single();
    for (uint8_t rate = 0; rate < 7; rate++) {
        idle();
        write_reg(0, rate << 2);
        check(read_reg(0) == (rate << 2), "rate-readback");
        uint16_t before = pulses;
        write_reg(2, 0);
        int64_t started = micros();
        wait_ready(2 * periods[rate] + 20000);
        check(near_time(micros() - started, 2 * periods[rate], 3000), "continuous-first-2periods");
        int64_t first_pulse = pulse_at;
        check(pulses == before + 1, "continuous-first-DRDY");
        expect_field(read_axes(), 1090);
        check((read_reg(9) & 3) == 0, "continuous-read-clears-ready");
        wait_ready(periods[rate] + 10000);
        check(near_time(pulse_at - first_pulse, periods[rate], 1000), "continuous-period");
        check(pulses == before + 2, "continuous-second-DRDY");
        expect_field(read_axes(), 1090);
        printf("rate-%u %u\n", rate, failures - section_start);
        section_start = failures;
    }

    idle();
    write_reg(0, 0x18);
    write_reg(1, 0x20);
    write_reg(2, 0);
    wait_ready(40000);
    uint8_t data[6];
    read_bytes(3, data, 1);
    check((read_reg(9) & 3) == 2, "partial-read-lock-ready");
    write_reg(1, 0);
    check((read_reg(9) & 2) != 0, "CRB-does-not-unlock");
    uint16_t before_locked = pulses;
    delay_ms(45);
    check(pulses == before_locked && (read_reg(9) & 3) == 2, "locked-update-suppressed");
    read_bytes(4, data + 1, 5);
    expect_field(decode(data), 1090);
    check((read_reg(9) & 3) == 0, "all6-unlock");
    wait_ready(25000);
    expect_field(read_axes(), 1370);
    check(read_reg(2) == 0 && (read_reg(9) & 2) != 0, "mode-read-lock");
    write_reg(0, 0x38);
    check((read_reg(9) & 2) == 0, "CRA-change-unlocks");
    wait_ready(40000);
    read_bytes(3, data, 1);
    write_reg(2, 2);
    check((read_reg(9) & 2) == 0, "mode-change-unlocks");
    read_axes();
    finish_section("locking");

    write_reg(1, 0x20);
    single();
    write_reg(0, 0x10);
    axes_t normal = single();
    expect_field(normal, 1090);
    write_reg(0, 0x11);
    expect_axes(single(), 1264, 1264, 1177, "positive-bias-offset-only");
    write_reg(0, 0x12);
    expect_axes(single(), -1264, -1264, -1177, "negative-bias-offset-only");
    write_reg(0, 0x10);
    expect_field(single(), 1090);
    uint8_t repeated[12];
    read_bytes(3, repeated, 12);
    for (uint8_t i = 0; i < 6; i++) check(repeated[i] == repeated[i + 6], "data-pointer-wrap");
    check((read_reg(9) & 2) == 0, "two-bursts-unlock");
    finish_section("bias-wrap");

    for (uint8_t mode = 2; mode <= 3; mode++) {
        write_reg(2, mode);
        read_axes();
        uint16_t before = pulses;
        delay_ms(40);
        check(pulses == before && (read_reg(9) & 1) == 0, "idle-no-measurements");
        check(read_reg(2) == mode, "idle-readback");
        expect_field(read_axes(), 1090);
    }
    write_reg(2, 0x81);
    wait_ready(15000);
    expect_field(read_axes(), 1090);
    check(read_reg(2) == 0x82, "HS-single-auto-idle");
    read_axes();
    finish_section("idle-HS");

    until(20020);
    expect_field_at(single(), 1090, .6f, -.4f, .2f);
    write_reg(0, 0x11);
    expect_axes(single(), 1264, 1264, 1177, "changed-ambient-positive-bias");
    write_reg(0, 0x12);
    expect_axes(single(), -1264, -1264, -1177, "changed-ambient-negative-bias");
    write_reg(0, 0x10);
    expect_field_at(single(), 1090, .6f, -.4f, .2f);
    finish_section("controls-bias");

    until(23020);
    for (uint8_t bias = 0; bias < 3; bias++) {
        write_reg(0, 0x10 | bias);
        expect_axes(single(), -4096, -4096, -4096, "overflow-sentinel");
    }
    finish_section("overflow");

    until(25020);
    write_reg(0, 0x10);
    expect_field(single(), 1090);
    finish_section("recovery");
    printf("failures %u\n", failures);
    for (;;) delay_ms(1000);
}
