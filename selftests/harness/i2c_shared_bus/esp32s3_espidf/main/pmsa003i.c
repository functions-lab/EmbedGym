// pmsa003i.c — see pmsa003i.h. Frame validation follows Adafruit_PM25AQI::read().
#include "pmsa003i.h"

#include <string.h>
#include "freertos/FreeRTOS.h"

#define PMSA003I_ADDR 0x12
#define FRAME_SIZE 32
#define IO_TIMEOUT pdMS_TO_TICKS(100)

_Static_assert(sizeof(pmsa003i_data_t) == FRAME_SIZE - 2, "frame words must pack without padding");

bool pmsa003i_probe(i2c_port_t port)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (PMSA003I_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(port, cmd, IO_TIMEOUT);
    i2c_cmd_link_delete(cmd);
    return err == ESP_OK;
}

bool pmsa003i_read(i2c_port_t port, pmsa003i_data_t *data)
{
    uint8_t buf[FRAME_SIZE];
    if (i2c_master_read_from_device(port, PMSA003I_ADDR, buf, sizeof buf, IO_TIMEOUT) != ESP_OK) {
        return false;
    }
    if (buf[0] != 0x42 || buf[1] != 0x4D) {
        return false;
    }
    uint16_t sum = 0;
    for (int i = 0; i < 30; i++) {
        sum += buf[i];
    }
    uint16_t words[15];
    for (int i = 0; i < 15; i++) {
        words[i] = (uint16_t)((buf[2 + 2 * i] << 8) | buf[3 + 2 * i]);
    }
    memcpy(data, words, sizeof words);
    return sum == data->checksum;
}
