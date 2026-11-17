// vl53l0x.h — VL53L0X time-of-flight sensor over ESP-IDF driver/i2c.h.
//
// A port of the Pololu VL53L0X Arduino library's register sequences: init()
// is DataInit + StaticInit + PerformRefCalibration, ranging uses the same
// start/stop wrapper, SYSRANGE_START modes and RESULT_INTERRUPT_STATUS poll,
// and set_address moves the device through register 0x8A.
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "driver/i2c.h"

// Range word the read functions return when the sensor never signalled a
// result within the poll timeout (the library's convention).
#define VL53L0X_TIMEOUT_MM 65535

typedef struct {
    i2c_port_t port;
    uint8_t addr;
    uint8_t stop_variable;
    // Device range status (bits 6:3 of RESULT_RANGE_STATUS) of the last range
    // read; 11 means a valid measurement.
    uint8_t last_range_status;
    bool timed_out;
} vl53l0x_t;

void vl53l0x_begin(vl53l0x_t *dev, i2c_port_t port, uint8_t addr);
bool vl53l0x_init(vl53l0x_t *dev);
void vl53l0x_set_address(vl53l0x_t *dev, uint8_t new_addr);
bool vl53l0x_set_signal_rate_limit(vl53l0x_t *dev, float limit_mcps);

uint16_t vl53l0x_read_range_single_mm(vl53l0x_t *dev);
void vl53l0x_start_continuous(vl53l0x_t *dev, uint32_t period_ms);
void vl53l0x_stop_continuous(vl53l0x_t *dev);
bool vl53l0x_range_ready(vl53l0x_t *dev);
uint16_t vl53l0x_read_range_continuous_mm(vl53l0x_t *dev);
bool vl53l0x_last_range_valid(const vl53l0x_t *dev);
