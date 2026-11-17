// PMSA003I selftest firmware for nrf52840_zephyr: raw I2C on i2c0. Every
// 200 ms one 32-byte frame is read, validated (header, length, checksum) and
// its standard and atmospheric concentrations printed. Before it, a 4-byte read, two 1-byte reads and a 40-byte read check
// that every transfer starts at the header and that a long one wraps, and a
// register-style read (one written byte, repeated start, 32 bytes) checks that
// the written byte is ignored; any mismatch prints "read failed".
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>

#define PMSA003I_ADDR 0x12
#define FRAME_SIZE    32

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));

static bool frame_valid(const uint8_t *f)
{
    uint16_t sum = 0;
    for (int i = 0; i < FRAME_SIZE - 2; i++) {
        sum += f[i];
    }
    return f[0] == 0x42 && f[1] == 0x4D && sys_get_be16(&f[2]) == 28 && sys_get_be16(&f[30]) == sum;
}

static bool partial_reads_start_at_the_header(void)
{
    static const uint8_t head[] = { 0x42, 0x4D, 0x00, 0x1C };
    uint8_t rx[FRAME_SIZE + 8];

    if (i2c_read(i2c, rx, sizeof(head), PMSA003I_ADDR) < 0 || memcmp(rx, head, sizeof(head)) != 0) {
        printk("4-byte read: %02x %02x %02x %02x\n", rx[0], rx[1], rx[2], rx[3]);
        return false;
    }
    for (int i = 0; i < 2; i++) {
        if (i2c_read(i2c, rx, 1, PMSA003I_ADDR) < 0 || rx[0] != 0x42) {
            printk("1-byte read: %02x\n", rx[0]);
            return false;
        }
    }
    if (i2c_read(i2c, rx, sizeof(rx), PMSA003I_ADDR) < 0 || !frame_valid(rx) || memcmp(&rx[FRAME_SIZE], rx, 8) != 0) {
        printk("40-byte read does not wrap to the header\n");
        return false;
    }
    if (i2c_burst_read(i2c, PMSA003I_ADDR, 0x00, rx, FRAME_SIZE) < 0 || !frame_valid(rx)) {
        printk("register-style read: %02x %02x\n", rx[0], rx[1]);
        return false;
    }
    if (i2c_read(i2c, rx, 1, PMSA003I_ADDR) < 0 || rx[0] != 0x42) {
        printk("1-byte read after the register-style read: %02x\n", rx[0]);
        return false;
    }
    return true;
}

int main(void)
{
    if (!device_is_ready(i2c)) {
        printk("i2c0 not ready\n");
        return 1;
    }
    for (;;) {
        uint8_t f[FRAME_SIZE];

        if (!partial_reads_start_at_the_header()) {
            printk("read failed\n");
        } else if (i2c_read(i2c, f, sizeof(f), PMSA003I_ADDR) < 0 || !frame_valid(f)) {
            printk("read failed\n");
        } else {
            printk("PM1.0: %d PM2.5: %d PM10: %d\n", sys_get_be16(&f[4]), sys_get_be16(&f[6]), sys_get_be16(&f[8]));
            printk("ATM1.0: %d ATM2.5: %d ATM10: %d\n", sys_get_be16(&f[10]), sys_get_be16(&f[12]), sys_get_be16(&f[14]));
        }
        k_msleep(200);
    }
    return 0;
}
