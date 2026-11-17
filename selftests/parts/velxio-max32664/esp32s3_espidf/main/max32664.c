// max32664.c — see max32664.h. Family / index bytes, masks and delays follow
// SparkFun_Bio_Sensor_Hub_Library.cpp.
#include "max32664.h"

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define HUB_ADDR   0x55
#define IO_TIMEOUT pdMS_TO_TICKS(100)

#define CMD_DELAY_MS        2
#define ENABLE_CMD_DELAY_MS 45

// Family bytes.
#define HUB_STATUS              0x00
#define READ_DEVICE_MODE        0x02
#define OUTPUT_MODE             0x10
#define READ_DATA_OUTPUT        0x12
#define WRITE_REGISTER          0x40
#define READ_REGISTER           0x41
#define ENABLE_SENSOR           0x44
#define CHANGE_ALGORITHM_CONFIG 0x50
#define READ_ALGORITHM_CONFIG   0x51
#define ENABLE_ALGORITHM        0x52
#define IDENTITY                0xFF

// Index bytes.
#define SET_FORMAT          0x00
#define WRITE_SET_THRESHOLD 0x01
#define NUM_SAMPLES         0x00
#define READ_DATA           0x01
#define MAX30101_INDEX      0x03
#define ENABLE_AGC_ALGO     0x00
#define ENABLE_WHRM_ALGO    0x02
#define AGC_CONFIG_INDEX    0x00
#define READ_MCU_TYPE       0x00

#define ALGO_DATA 0x02
#define ENABLE    0x01

// AGC config ids.
#define AGC_GAIN_ID        0x00
#define AGC_STEP_SIZE_ID   0x01
#define AGC_NUM_SAMPLES_ID 0x03

#define CONFIGURATION_REGISTER 0x0A
#define PULSE_MASK      0xFC
#define READ_PULSE_MASK 0x03
#define SAMP_MASK       0xE3
#define READ_SAMP_MASK  0x1C
#define ADC_MASK        0x9F
#define READ_ADC_MASK   0x60

#define MAXFAST_ARRAY_SIZE    6
#define MAXFAST_EXTENDED_DATA 5

static void write_cmd(max32664_t *dev, const uint8_t *cmd, size_t n, uint32_t delay_ms)
{
    i2c_master_write_to_device(dev->port, HUB_ADDR, cmd, n, IO_TIMEOUT);
    vTaskDelay(pdMS_TO_TICKS(delay_ms));
}

// Wire.read() on an empty buffer returns -1; the library stores it as 0xFF.
static void read_reply(max32664_t *dev, uint8_t *out, size_t n)
{
    if (i2c_master_read_from_device(dev->port, HUB_ADDR, out, n, IO_TIMEOUT) != ESP_OK) {
        memset(out, 0xFF, n);
    }
}

// writeByte(family, index, byte): the lone status byte.
static uint8_t write_byte(max32664_t *dev, uint8_t family, uint8_t index, uint8_t byte)
{
    uint8_t cmd[3] = {family, index, byte};
    uint8_t status;
    write_cmd(dev, cmd, 3, CMD_DELAY_MS);
    read_reply(dev, &status, 1);
    return status;
}

// writeByte(family, index, byte, value): register-style write.
static uint8_t write_byte2(max32664_t *dev, uint8_t family, uint8_t index, uint8_t byte, uint8_t value)
{
    uint8_t cmd[4] = {family, index, byte, value};
    uint8_t status;
    write_cmd(dev, cmd, 4, CMD_DELAY_MS);
    read_reply(dev, &status, 1);
    return status;
}

// enableWrite(): the enable commands wait 45 ms before the status read.
static uint8_t enable_write(max32664_t *dev, uint8_t family, uint8_t index, uint8_t byte)
{
    uint8_t cmd[3] = {family, index, byte};
    uint8_t status;
    write_cmd(dev, cmd, 3, ENABLE_CMD_DELAY_MS);
    read_reply(dev, &status, 1);
    return status;
}

// readByte(family, index[, byte]): [status, value]; a nonzero status is returned in place of the value.
static uint8_t read_byte(max32664_t *dev, const uint8_t *cmd, size_t n)
{
    uint8_t reply[2];
    write_cmd(dev, cmd, n, CMD_DELAY_MS);
    read_reply(dev, reply, 2);
    return reply[0] != MAX32664_SUCCESS ? reply[0] : reply[1];
}

static uint8_t read_byte2(max32664_t *dev, uint8_t family, uint8_t index)
{
    uint8_t cmd[2] = {family, index};
    return read_byte(dev, cmd, 2);
}

static uint8_t read_byte3(max32664_t *dev, uint8_t family, uint8_t index, uint8_t byte)
{
    uint8_t cmd[3] = {family, index, byte};
    return read_byte(dev, cmd, 3);
}

// readFillArray(): [status, d0..dN-1]; the data is zeroed on a nonzero status.
static uint8_t read_fill_array(max32664_t *dev, uint8_t family, uint8_t index, uint8_t n, uint8_t *out)
{
    uint8_t cmd[2] = {family, index};
    uint8_t reply[1 + MAXFAST_ARRAY_SIZE + MAXFAST_EXTENDED_DATA];
    write_cmd(dev, cmd, 2, CMD_DELAY_MS);
    read_reply(dev, reply, n + 1);
    if (reply[0] != MAX32664_SUCCESS) {
        memset(out, 0, n);
        return reply[0];
    }
    memcpy(out, reply + 1, n);
    return MAX32664_SUCCESS;
}

static uint8_t read_register(max32664_t *dev, uint8_t reg)
{
    return read_byte3(dev, READ_REGISTER, MAX30101_INDEX, reg);
}

static void write_register(max32664_t *dev, uint8_t reg, uint8_t value)
{
    write_byte2(dev, WRITE_REGISTER, MAX30101_INDEX, reg, value);
}

uint8_t max32664_begin(max32664_t *dev, i2c_port_t port, gpio_num_t rst_pin, gpio_num_t mfio_pin)
{
    dev->port = port;
    dev->rst_pin = rst_pin;
    dev->mfio_pin = mfio_pin;
    dev->mode = 0;

    gpio_reset_pin(rst_pin);
    gpio_set_direction(rst_pin, GPIO_MODE_OUTPUT);
    gpio_reset_pin(mfio_pin);
    gpio_set_direction(mfio_pin, GPIO_MODE_OUTPUT);

    gpio_set_level(mfio_pin, 1);
    gpio_set_level(rst_pin, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(rst_pin, 1);
    vTaskDelay(pdMS_TO_TICKS(1000));
    // The library hands MFIO back as an input with pull-up for a later interrupt.
    gpio_set_direction(mfio_pin, GPIO_MODE_INPUT);
    gpio_set_pull_mode(mfio_pin, GPIO_PULLUP_ONLY);

    return read_byte2(dev, READ_DEVICE_MODE, 0x00);
}

uint8_t max32664_config_bpm(max32664_t *dev, uint8_t mode)
{
    uint8_t status;
    if ((status = write_byte(dev, OUTPUT_MODE, SET_FORMAT, ALGO_DATA)) != MAX32664_SUCCESS) return status;
    if ((status = write_byte(dev, OUTPUT_MODE, WRITE_SET_THRESHOLD, 0x01)) != MAX32664_SUCCESS) return status;
    if ((status = enable_write(dev, ENABLE_ALGORITHM, ENABLE_AGC_ALGO, ENABLE)) != MAX32664_SUCCESS) return status;
    if ((status = enable_write(dev, ENABLE_SENSOR, MAX30101_INDEX, ENABLE)) != MAX32664_SUCCESS) return status;
    if ((status = enable_write(dev, ENABLE_ALGORITHM, ENABLE_WHRM_ALGO, mode)) != MAX32664_SUCCESS) return status;
    dev->mode = mode;
    read_byte3(dev, READ_ALGORITHM_CONFIG, AGC_CONFIG_INDEX, AGC_NUM_SAMPLES_ID);
    vTaskDelay(pdMS_TO_TICKS(1000));
    return MAX32664_SUCCESS;
}

max32664_bio_t max32664_read_bpm(max32664_t *dev)
{
    max32664_bio_t bio = {0};
    uint8_t block[MAXFAST_ARRAY_SIZE + MAXFAST_EXTENDED_DATA];

    if (read_byte2(dev, HUB_STATUS, 0x00) == 1) {
        return bio;   // communication error flag
    }
    read_byte2(dev, READ_DATA_OUTPUT, NUM_SAMPLES);

    if (dev->mode == MAX32664_MODE_ONE) {
        read_fill_array(dev, READ_DATA_OUTPUT, READ_DATA, MAXFAST_ARRAY_SIZE, block);
    } else if (dev->mode == MAX32664_MODE_TWO) {
        read_fill_array(dev, READ_DATA_OUTPUT, READ_DATA, MAXFAST_ARRAY_SIZE + MAXFAST_EXTENDED_DATA, block);
    } else {
        return bio;
    }

    // Heart rate and SpO2 travel scaled by 10.
    bio.heart_rate = (uint16_t)(((uint16_t)block[0] << 8) | block[1]) / 10;
    bio.confidence = block[2];
    bio.oxygen = (uint16_t)(((uint16_t)block[3] << 8) | block[4]) / 10;
    bio.status = block[5];
    if (dev->mode == MAX32664_MODE_TWO) {
        bio.r_value = (float)(((uint16_t)block[6] << 8) | block[7]) / 10.0f;
        bio.ext_status = (int8_t)block[8];
    }
    return bio;
}

uint8_t max32664_set_pulse_width(max32664_t *dev, uint16_t width_us)
{
    uint8_t bits;
    if (width_us == 69) bits = 0;
    else if (width_us == 118) bits = 1;
    else if (width_us == 215) bits = 2;
    else if (width_us == 411) bits = 3;
    else return MAX32664_ERR_UNKNOWN;
    uint8_t reg = read_register(dev, CONFIGURATION_REGISTER);
    write_register(dev, CONFIGURATION_REGISTER, (reg & PULSE_MASK) | bits);
    return MAX32664_SUCCESS;
}

uint16_t max32664_read_pulse_width(max32664_t *dev)
{
    static const uint16_t widths[4] = {69, 118, 215, 411};
    return widths[read_register(dev, CONFIGURATION_REGISTER) & READ_PULSE_MASK];
}

uint8_t max32664_set_sample_rate(max32664_t *dev, uint16_t rate_hz)
{
    static const uint16_t rates[8] = {50, 100, 200, 400, 800, 1000, 1600, 3200};
    uint8_t bits = 0;
    while (bits < 8 && rates[bits] != rate_hz) bits++;
    if (bits == 8) return MAX32664_ERR_UNKNOWN;
    uint8_t reg = read_register(dev, CONFIGURATION_REGISTER);
    write_register(dev, CONFIGURATION_REGISTER, (reg & SAMP_MASK) | (bits << 2));
    return MAX32664_SUCCESS;
}

uint16_t max32664_read_sample_rate(max32664_t *dev)
{
    static const uint16_t rates[8] = {50, 100, 200, 400, 800, 1000, 1600, 3200};
    return rates[(read_register(dev, CONFIGURATION_REGISTER) & READ_SAMP_MASK) >> 2];
}

uint8_t max32664_set_adc_range(max32664_t *dev, uint16_t range_na)
{
    uint8_t bits;
    if (range_na <= 2048) bits = 0;
    else if (range_na <= 4096) bits = 1;
    else if (range_na <= 8192) bits = 2;
    else if (range_na <= 16384) bits = 3;
    else return MAX32664_ERR_UNKNOWN;
    uint8_t reg = read_register(dev, CONFIGURATION_REGISTER);
    write_register(dev, CONFIGURATION_REGISTER, (reg & ADC_MASK) | (bits << 5));
    return MAX32664_SUCCESS;
}

uint16_t max32664_read_adc_range(max32664_t *dev)
{
    static const uint16_t ranges[4] = {2048, 4096, 8192, 16384};
    return ranges[(read_register(dev, CONFIGURATION_REGISTER) & READ_ADC_MASK) >> 5];
}

uint8_t max32664_set_algo_range(max32664_t *dev, uint8_t percent)
{
    return write_byte2(dev, CHANGE_ALGORITHM_CONFIG, AGC_CONFIG_INDEX, AGC_GAIN_ID, percent);
}

uint8_t max32664_read_algo_range(max32664_t *dev)
{
    return read_byte3(dev, READ_ALGORITHM_CONFIG, AGC_CONFIG_INDEX, AGC_GAIN_ID);
}

uint8_t max32664_set_algo_step_size(max32664_t *dev, uint8_t step)
{
    return write_byte2(dev, CHANGE_ALGORITHM_CONFIG, AGC_CONFIG_INDEX, AGC_STEP_SIZE_ID, step);
}

uint8_t max32664_read_algo_step_size(max32664_t *dev)
{
    return read_byte3(dev, READ_ALGORITHM_CONFIG, AGC_CONFIG_INDEX, AGC_STEP_SIZE_ID);
}

uint8_t max32664_get_mcu_type(max32664_t *dev)
{
    uint8_t type = read_byte3(dev, IDENTITY, READ_MCU_TYPE, 0x00);
    return type != MAX32664_SUCCESS ? MAX32664_ERR_UNKNOWN : type;
}
