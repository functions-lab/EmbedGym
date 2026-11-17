// DRV2605L selftest firmware for nrf52840_zephyr: raw register transfers on i2c0.
#include <stdint.h>

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/printk.h>

#define ADDR 0x5a

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));
// Reset values of 0x00..0x20 per the datasheet's register field tables.
static const uint8_t RESET_VALUES[0x21] = {
    0xE0, 0x40, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x05, 0x19, 0xFF, 0x19, 0xFF, 0x3E, 0x8C, 0x0C, 0x6F, 0x36, 0x93, 0xF5, 0xA0, 0x20, 0x80, 0x00,
};

static void wait_until(int64_t ms)
{
    while (k_uptime_get() < ms) {
    }
}

static void write_register(uint8_t reg, uint8_t value)
{
    i2c_reg_write_byte(i2c, ADDR, reg, value);
}

static uint8_t read_register(uint8_t reg)
{
    uint8_t value = 0;

    i2c_reg_read_byte(i2c, ADDR, reg, &value);
    return value;
}

static int reset_mismatches(void)
{
    uint8_t regs[0x21];
    uint8_t start = 0x00;
    int mismatches = 0;

    i2c_write_read(i2c, ADDR, &start, 1, regs, sizeof regs);
    for (int i = 0; i < 0x21; i++) {
        if (regs[i] != RESET_VALUES[i]) {
            mismatches++;
        }
    }
    return mismatches;
}

// Fires GO and polls it every 1 ms; returns the ms until it reads 0.
static int64_t run_until_go_clears(void)
{
    int64_t start = k_uptime_get();

    write_register(0x0C, 1);
    while (read_register(0x0C) & 1) {
        k_busy_wait(1000);
    }
    return k_uptime_get() - start;
}

int main(void)
{
    wait_until(50);
    printk("reset %d\n", reset_mismatches());

    wait_until(200);
    write_register(0x01, 0x00);
    write_register(0x03, 0x01);
    write_register(0x1A, read_register(0x1A) & 0x7F);
    write_register(0x1D, read_register(0x1D) | 0x20);
    const uint8_t sequence[] = {10, 0x80 | 20, 47, 0};
    for (int i = 0; i < (int)sizeof sequence; i++) {
        write_register(0x04 + i, sequence[i]);
    }

    wait_until(500);
    printk("seq %d\n", (int)run_until_go_clears());

    wait_until(1000);
    for (int i = 0; i < 8; i++) {
        write_register(0x04 + i, i + 1);
    }
    printk("eight %d\n", (int)run_until_go_clears());

    wait_until(2000);
    write_register(0x04, 47);
    write_register(0x05, 0);
    write_register(0x0C, 1);
    wait_until(2050);
    write_register(0x0C, 0);
    printk("cancel %u\n", read_register(0x0C));

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
    printk("standby-go %u\n", read_register(0x0C));

    wait_until(2900);
    write_register(0x01, 0x80);
    printk("dev-reset %d\n", reset_mismatches());

    wait_until(3100);
    write_register(0x01, 0x06);
    int64_t ms = run_until_go_clears();
    printk("diag %d %u\n", (int)ms, read_register(0x00));

    wait_until(3300);
    write_register(0x01, 0x07);
    ms = run_until_go_clears();
    printk("cal %d %u\n", (int)ms, read_register(0x00));
    return 0;
}
