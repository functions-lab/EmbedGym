// HMC5883L library selftest (ESP32-S3 variant of code/code.ino, which uses
// Adafruit_HMC5883_Unified; there is no ESP-IDF port of it, so this replays
// its bus traffic): begin() writes MODE = continuous then CRB = 1.3 Ga,
// setMagGain() writes CRB, getEvent() reads the six data bytes from X_H.
// The sketch prints each reading scaled back to counts, so this prints the
// counts. "sensor 1" stands for a successful identification read.
#include <stdint.h>
#include <stdio.h>
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define ADDR 0x1e

static const uint8_t gains[] = {0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0};

static void write8(uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    i2c_master_write_to_device(I2C_NUM_0, ADDR, buf, 2, pdMS_TO_TICKS(100));
}

static void print_reading(const char *prefix, int gain)
{
    uint8_t reg = 0x03;
    uint8_t d[6];
    i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, d, 6, pdMS_TO_TICKS(100));
    int16_t x = (int16_t)((d[0] << 8) | d[1]);
    int16_t z = (int16_t)((d[2] << 8) | d[3]);
    int16_t y = (int16_t)((d[4] << 8) | d[5]);
    printf("%s %d %d %d %d\n", prefix, gain, x, y, z);
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

    write8(0x02, 0x00);
    write8(0x01, 0x20);
    uint8_t reg = 0x0a;
    uint8_t id[3] = {0};
    i2c_master_write_read_device(I2C_NUM_0, ADDR, &reg, 1, id, 3, pdMS_TO_TICKS(100));
    printf("sensor %d\n", id[0] == 'H' && id[1] == '4' && id[2] == '3');
    for (int gain = 0; gain < 7; gain++) {
        write8(0x01, gains[gain]);
        vTaskDelay(pdMS_TO_TICKS(250));
        print_reading("gain", gain);
    }
    for (;;) {
        print_reading("field", 6);
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
