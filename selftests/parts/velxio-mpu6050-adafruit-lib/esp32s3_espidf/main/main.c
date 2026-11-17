// MPU6050 driven the way the Adafruit_MPU6050 library does (ESP32-S3 variant
// of code/code.ino, which uses the library itself; there is no ESP-IDF port of
// it, so this hand-rolls the register traffic begin() and getEvent() issue).
//
// begin(): read WHO_AM_I and require 0x68; reset() = read-modify-write
// DEVICE_RESET into PWR_MGMT_1, poll it until the device clears it, write
// SIGNAL_PATH_RESET 0x07; then SMPLRT_DIV 0, CONFIG DLPF 260 Hz, GYRO_CONFIG
// ±500 deg/s, ACCEL_CONFIG ±2 g (each a read-modify-write), PWR_MGMT_1 = 0x01
// (PLL, X gyro). getEvent(): read back both range registers, burst 14 bytes
// from 0x3B, scale accel to m/s^2. Like the sketch, prints BOOT, then READY /
// NOINIT, then "aZ: <m/s^2 * 100>" every 200 ms; a hang produces no output.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define MPU_ADDR 0x68

#define REG_SMPLRT_DIV   0x19
#define REG_CONFIG       0x1A
#define REG_GYRO_CONFIG  0x1B
#define REG_ACCEL_CONFIG 0x1C
#define REG_ACCEL_OUT    0x3B
#define REG_SIG_PATH_RST 0x68
#define REG_PWR_MGMT_1   0x6B
#define REG_WHO_AM_I     0x75

static bool read_regs(uint8_t reg, uint8_t *out, size_t n)
{
    return i2c_master_write_read_device(I2C_NUM_0, MPU_ADDR, &reg, 1, out, n,
                                        pdMS_TO_TICKS(100)) == ESP_OK;
}

static bool write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    return i2c_master_write_to_device(I2C_NUM_0, MPU_ADDR, buf, 2, pdMS_TO_TICKS(100)) == ESP_OK;
}

// Adafruit_BusIO_RegisterBits::write — read the register, replace the field, write it back.
static bool write_bits(uint8_t reg, uint8_t width, uint8_t shift, uint8_t value)
{
    uint8_t cur;
    if (!read_regs(reg, &cur, 1)) return false;
    uint8_t mask = ((1u << width) - 1) << shift;
    cur = (cur & ~mask) | ((value << shift) & mask);
    return write_reg(reg, cur);
}

static uint8_t read_bits(uint8_t reg, uint8_t width, uint8_t shift)
{
    uint8_t cur = 0;
    read_regs(reg, &cur, 1);
    return (cur >> shift) & ((1u << width) - 1);
}

static bool mpu_begin(void)
{
    uint8_t id;
    if (!read_regs(REG_WHO_AM_I, &id, 1) || id != 0x68) return false;

    // reset()
    if (!write_bits(REG_PWR_MGMT_1, 1, 7, 1)) return false;
    while (read_bits(REG_PWR_MGMT_1, 1, 7) == 1) {
        vTaskDelay(pdMS_TO_TICKS(1));
    }
    vTaskDelay(pdMS_TO_TICKS(100));
    if (!write_reg(REG_SIG_PATH_RST, 0x07)) return false;
    vTaskDelay(pdMS_TO_TICKS(100));

    if (!write_reg(REG_SMPLRT_DIV, 0)) return false;          // setSampleRateDivisor(0)
    if (!write_bits(REG_CONFIG, 3, 0, 0)) return false;       // setFilterBandwidth(260 Hz)
    if (!write_bits(REG_GYRO_CONFIG, 2, 3, 1)) return false;  // setGyroRange(±500 deg/s)
    if (!write_bits(REG_ACCEL_CONFIG, 2, 3, 0)) return false; // setAccelerometerRange(±2 g)
    if (!write_reg(REG_PWR_MGMT_1, 0x01)) return false;       // PLL with X gyro reference
    vTaskDelay(pdMS_TO_TICKS(100));
    return true;
}

// Adafruit_MPU6050::_read(): both range registers, then the 14-byte burst.
static float accel_z_ms2(void)
{
    uint8_t accel_range = read_bits(REG_ACCEL_CONFIG, 2, 3);
    read_bits(REG_GYRO_CONFIG, 2, 3);
    uint8_t d[14];
    read_regs(REG_ACCEL_OUT, d, 14);
    int16_t raw_z = (int16_t)((d[4] << 8) | d[5]);
    float lsb_per_g = 16384.0f / (float)(1 << accel_range);
    return raw_z / lsb_per_g * 9.80665f;
}

void app_main(void)
{
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

    printf("BOOT\n");
    bool up = mpu_begin();
    printf(up ? "READY\n" : "NOINIT\n");

    for (;;) {
        if (up) {
            printf("aZ: %d\n", (int)(accel_z_ms2() * 100));
        }
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}
