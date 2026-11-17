// sgp40.h — SGP40 VOC sensor over ESP-IDF v4.4's legacy driver/i2c.h, a hand-
// rolled port of the Adafruit_SGP40 library's traffic: each command is a
// 16-bit big-endian word written in its own transaction; after the command's
// execution time the result is read in a separate transaction as 3-byte words
// (MSB, LSB, Sensirion CRC-8). Delays are the library's (500 ms self-test,
// 250 ms measure, 10 ms for stored values).
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "driver/i2c.h"

typedef struct {
    i2c_port_t port;
    uint16_t serial[3];   // 48-bit serial number, filled by sgp40_begin
} sgp40_t;

// Serial number, featureset, then self-test; false if any step fails.
bool sgp40_begin(sgp40_t *dev, i2c_port_t port);
// True when the sensor reports 0xD400 (all tests passed).
bool sgp40_self_test(sgp40_t *dev);
bool sgp40_heater_off(sgp40_t *dev);
bool sgp40_soft_reset(sgp40_t *dev);
// Raw SRAW ticks with humidity / temperature compensation; 0 on a bus or CRC failure.
uint16_t sgp40_measure_raw(sgp40_t *dev, float temperature_c, float humidity_pct);
