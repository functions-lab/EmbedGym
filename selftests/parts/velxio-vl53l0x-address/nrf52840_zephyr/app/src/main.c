// VL53L0X address-move selftest firmware for nrf52840_zephyr.
//
// Ranges at the power-on address 0x29, writes 0x30 to the slave-address
// register, checks that 0x29 no longer answers, then ranges at 0x30 forever.
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>

#define POWER_ON_ADDR 0x29
#define MOVED_ADDR    0x30

#define SYSRANGE_START             0x00
#define SYSTEM_INTERRUPT_CLEAR     0x0B
#define RESULT_INTERRUPT_STATUS    0x13
#define RESULT_RANGE_MM            0x1E
#define I2C_SLAVE_DEVICE_ADDRESS   0x8A
#define IDENTIFICATION_MODEL_ID    0xC0

static const struct device *const i2c = DEVICE_DT_GET(DT_NODELABEL(i2c0));

static void halt(const char *why)
{
    printk("%s\n", why);
    for (;;) {
        k_sleep(K_FOREVER);
    }
}

static uint16_t range_single(uint8_t addr)
{
    uint8_t status = 0;
    uint8_t mm[2];

    if (i2c_reg_write_byte(i2c, addr, SYSRANGE_START, 0x01) < 0) {
        halt("start failed");
    }
    while (!(status & 0x07)) {
        if (i2c_reg_read_byte(i2c, addr, RESULT_INTERRUPT_STATUS, &status) < 0) {
            halt("status read failed");
        }
    }
    if (i2c_burst_read(i2c, addr, RESULT_RANGE_MM, mm, sizeof mm) < 0 ||
        i2c_reg_write_byte(i2c, addr, SYSTEM_INTERRUPT_CLEAR, 0x01) < 0) {
        halt("result read failed");
    }
    return sys_get_be16(mm);
}

int main(void)
{
    uint8_t id = 0;

    if (!device_is_ready(i2c)) {
        halt("i2c0 not ready");
    }
    printk("A41 %u mm\n", range_single(POWER_ON_ADDR));

    if (i2c_reg_write_byte(i2c, POWER_ON_ADDR, I2C_SLAVE_DEVICE_ADDRESS, MOVED_ADDR) < 0) {
        halt("address write failed");
    }
    printk("OLD %d\n", i2c_reg_read_byte(i2c, POWER_ON_ADDR, IDENTIFICATION_MODEL_ID, &id) < 0 ? 0 : 1);
    if (i2c_reg_read_byte(i2c, MOVED_ADDR, IDENTIFICATION_MODEL_ID, &id) < 0) {
        halt("no answer at the new address");
    }
    printk("ID %u\n", id);

    for (;;) {
        printk("A48 %u mm\n", range_single(MOVED_ADDR));
        k_msleep(200);
    }
    return 0;
}
