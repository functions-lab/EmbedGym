// PMSA003I (0x12) and SGP40 (0x59) on one I2C_NUM_0 master (SDA GPIO38,
// SCL GPIO39); prints PM2.5 standard and the raw VOC signal every second.
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include "pmsa003i.h"
#include "sgp40.h"

#define I2C_PORT I2C_NUM_0

static void halt(const char *msg)
{
    printf("%s\n", msg);
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void app_main(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = GPIO_NUM_38,
        .scl_io_num = GPIO_NUM_39,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 100000,
    };
    ESP_ERROR_CHECK(i2c_param_config(I2C_PORT, &conf));
    ESP_ERROR_CHECK(i2c_driver_install(I2C_PORT, I2C_MODE_MASTER, 0, 0, 0));

    if (!pmsa003i_probe(I2C_PORT)) {
        halt("PMSA003I not found");
    }
    sgp40_t sgp;
    if (!sgp40_begin(&sgp, I2C_PORT)) {
        halt("SGP40 init failed");
    }

    TickType_t wake = xTaskGetTickCount();
    for (;;) {
        pmsa003i_data_t pm;
        if (!pmsa003i_read(I2C_PORT, &pm)) {
            halt("PMSA003I read failed");
        }
        uint16_t voc = sgp40_measure_raw(&sgp, 25, 50);
        if (voc == 0) {
            halt("SGP40 read failed");
        }
        printf("PM2.5: %u VOC: %u\n", pm.pm25_standard, voc);
        vTaskDelayUntil(&wake, pdMS_TO_TICKS(1000));
    }
}
