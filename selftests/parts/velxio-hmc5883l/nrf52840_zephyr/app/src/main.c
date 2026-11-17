// HMC5883L register-level selftest for nrf52840_zephyr (port of the AVR
// sketch): raw I2C on i2c0, DRDY on the hmc5883l-drdy alias timed by a
// both-edge GPIO callback. Times count from reset in 30.5 us ticks.
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x1e

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
static const struct gpio_dt_spec drdy = GPIO_DT_SPEC_GET(DT_ALIAS(hmc5883l_drdy), gpios);
static struct gpio_callback drdy_cb;

static volatile uint16_t pulses = 0;
static volatile int64_t pulse_at = 0;
static volatile int64_t pulse_width = 0;
static uint16_t failures = 0;
static uint16_t section_start = 0;
static const int gains[] = {1370, 1090, 820, 660, 440, 390, 330, 230};
static const int64_t periods[] = {1333333, 666667, 333333, 133333, 66667, 33333, 13333};

typedef struct { int16_t x; int16_t y; int16_t z; } axes_t;

static int64_t micros(void) { return k_ticks_to_us_floor64(k_uptime_ticks()); }

static void ready_edge(const struct device *port, struct gpio_callback *cb, uint32_t pins)
{
    if (gpio_pin_get_dt(&drdy) == 0) {
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
        printk("FAIL %s\n", name);
    }
}

static void finish_section(const char *name)
{
    printk("%s %u\n", name, failures - section_start);
    section_start = failures;
}

static void bus_failure(void)
{
    printk("FAIL bus\n");
    for (;;) k_msleep(1000);
}

static void write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    if (i2c_write(i2c, buf, 2, ADDR) < 0) bus_failure();
}

static void read_bytes(uint8_t reg, uint8_t *data, size_t length)
{
    if (i2c_write_read(i2c, ADDR, &reg, 1, data, length) < 0) bus_failure();
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
    while (k_uptime_get() < time_ms) k_msleep(1);
}

int main(void)
{
    if (!device_is_ready(i2c) || !gpio_is_ready_dt(&drdy)) {
        printk("devices not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&drdy, GPIO_INPUT);
    gpio_init_callback(&drdy_cb, ready_edge, BIT(drdy.pin));
    gpio_add_callback(drdy.port, &drdy_cb);
    gpio_pin_interrupt_configure_dt(&drdy, GPIO_INT_EDGE_BOTH);

    check(read_reg(0) == 0x10 && read_reg(1) == 0x20, "powerup-config");
    check(read_reg(2) == 1, "powerup-single-mode");
    check((read_reg(9) & 2) != 0, "mode-read-locks");
    write_reg(0, 0x30);
    check((read_reg(9) & 2) == 0, "CRA-unlocks-startup");
    until(50);
    check((read_reg(9) & 1) == 0 && pulses == 0, "powerup-not-early");
    int64_t startup_ready = wait_ready(15000);
    check(startup_ready >= 55000 && startup_ready <= 59000, "powerup-56ms");
    expect_field(read_axes(), 1090);
    check((read_reg(9) & 3) == 0, "read-clears-ready-lock");
    check(read_reg(2) == 2, "single-auto-idle");
    read_axes();
    k_msleep(1);
    check(pulses == 1 && gpio_pin_get_dt(&drdy) == 1, "startup-DRDY");
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
        printk("rate-%u %u\n", rate, failures - section_start);
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
    k_msleep(45);
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
        k_msleep(40);
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
    printk("failures %u\n", failures);
    return 0;
}
