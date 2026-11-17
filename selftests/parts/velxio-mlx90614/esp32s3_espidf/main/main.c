// MLX90614 selftest firmware (ESP32-S3 variant of code/code.ino).
#include <stdbool.h>
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"

#define SDA_PIN GPIO_NUM_38
#define SCL_PIN GPIO_NUM_39
#define ADDR 0x5a
#define TIMEOUT pdMS_TO_TICKS(100)

static unsigned failures = 0;
static unsigned section_start = 0;

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

static uint8_t crc8(const uint8_t *data, int length)
{
    uint8_t crc = 0;
    for (int i = 0; i < length; i++) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; bit++) {
            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
        }
    }
    return crc;
}

// SMBus Read Word with a repeated START; checks the PEC.
static uint16_t read_word(uint8_t command)
{
    uint8_t reply[3] = {0};
    check(i2c_master_write_read_device(I2C_NUM_0, ADDR, &command, 1, reply, 3, TIMEOUT) == ESP_OK, "read-word");
    uint8_t frame[5] = {ADDR << 1, command, (ADDR << 1) | 1, reply[0], reply[1]};
    check(reply[2] == crc8(frame, 5), "read-pec");
    return reply[0] | (reply[1] << 8);
}

static esp_err_t write_word(uint8_t command, uint16_t value, bool good_pec)
{
    uint8_t frame[4] = {ADDR << 1, command, value & 0xff, value >> 8};
    uint8_t pec = crc8(frame, 4);
    uint8_t out[4] = {command, frame[2], frame[3], good_pec ? pec : (uint8_t)(pec ^ 0xff)};
    return i2c_master_write_to_device(I2C_NUM_0, ADDR, out, sizeof out, TIMEOUT);
}

static esp_err_t probe(void)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(I2C_NUM_0, cmd, TIMEOUT);
    i2c_cmd_link_delete(cmd);
    return err;
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
    vTaskDelay(pdMS_TO_TICKS(300));

    check(probe() == ESP_OK, "address-probe");
    finish_section("probe");

    check(read_word(0x07) == 15095, "tobj1-28.75");
    check(read_word(0x06) == 14732, "ta-21.49");
    finish_section("ram");

    check(read_word(0x24) == 0xffff, "emissivity-factory");
    check((read_word(0x2e) & 0xff) == ADDR, "smbus-address-cell");
    check((read_word(0x22) & 0x0002) == 0, "pwm-disabled");
    check((read_word(0x25) & 0x0040) == 0, "single-ir-sensor");
    check(read_word(0xf0) == 0x0010, "flags-idle");
    finish_section("eeprom");

    check(write_word(0x24, 0x0000, true) == ESP_OK, "erase-ack");
    check(read_word(0xf0) == 0x0090, "eebusy-after-erase");
    vTaskDelay(pdMS_TO_TICKS(10));
    check(read_word(0xf0) == 0x0010, "eebusy-clears");
    check(read_word(0x24) == 0x0000, "erased");
    check(write_word(0x24, 0xf332, true) == ESP_OK, "write-ack");
    vTaskDelay(pdMS_TO_TICKS(10));
    check(read_word(0x24) == 0xf332, "written");
    check(read_word(0x07) == 15095, "emissivity-waits-for-power-up");
    write_word(0x24, 0x0000, true);
    vTaskDelay(pdMS_TO_TICKS(10));
    write_word(0x24, 0xffff, true);
    vTaskDelay(pdMS_TO_TICKS(10));
    check(read_word(0x24) == 0xffff, "restored");
    finish_section("eeprom-write");

    check(write_word(0x24, 0x0000, false) != ESP_OK, "bad-pec-nacked");
    vTaskDelay(pdMS_TO_TICKS(10));
    check(read_word(0x24) == 0xffff, "bad-pec-discarded");
    finish_section("bad-pec");

    printf("failures %u\n", failures);

    for (;;) {
        uint16_t object = read_word(0x07);
        uint16_t ambient = read_word(0x06);
        printf("raw %u %u\n", object, ambient);
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
