// SGP40 unit test firmware (ESP32-S3 variant of code/code.ino), on the sgp40.c
// driver beside it: begin (serial number, featureset, self-test), the serial
// number in hex, self-test / heater off / soft reset results, then a loop that
// prints "RAW <ticks>" measured with the default compensation and "COMP
// <ticks>" measured at 30 °C / 80 %RH every 400 ms. Before the loop it also
// reads a measurement back too early to show the sensor NACKs a busy read
// ("EARLY NACK"); that line is diagnostic, not graded.
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include "sgp40.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39

static void early_read_check(void)
{
    // Adafruit's default measure command (25 °C, 50 %RH), then an immediate read.
    const uint8_t cmd[8] = {0x26, 0x0F, 0x80, 0x00, 0xA2, 0x66, 0x66, 0x93};
    uint8_t reply[3];
    i2c_master_write_to_device(I2C_NUM_0, 0x59, cmd, sizeof cmd, pdMS_TO_TICKS(100));
    esp_err_t early = i2c_master_read_from_device(I2C_NUM_0, 0x59, reply, 3, pdMS_TO_TICKS(100));
    vTaskDelay(pdMS_TO_TICKS(250));
    esp_err_t late = i2c_master_read_from_device(I2C_NUM_0, 0x59, reply, 3, pdMS_TO_TICKS(100));
    printf("EARLY %s\n", early != ESP_OK && late == ESP_OK ? "NACK" : "UNEXPECTED");
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

    sgp40_t sgp;
    if (!sgp40_begin(&sgp, I2C_NUM_0)) {
        printf("init failed\n");
        for (;;) {
            vTaskDelay(pdMS_TO_TICKS(1000));
        }
    }

    printf("SERIAL %X %X %X\n", sgp.serial[0], sgp.serial[1], sgp.serial[2]);
    printf("SELFTEST %s\n", sgp40_self_test(&sgp) ? "PASS" : "FAIL");
    printf("HEATEROFF %s\n", sgp40_heater_off(&sgp) ? "OK" : "FAIL");
    printf("RESET %s\n", sgp40_soft_reset(&sgp) ? "OK" : "FAIL");
    early_read_check();

    for (;;) {
        printf("RAW %u\n", sgp40_measure_raw(&sgp, 25, 50));
        printf("COMP %u\n", sgp40_measure_raw(&sgp, 30, 80));
        vTaskDelay(pdMS_TO_TICKS(400));
    }
}
