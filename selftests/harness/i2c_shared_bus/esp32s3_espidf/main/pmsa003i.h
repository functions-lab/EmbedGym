// pmsa003i.h — PMSA003I particulate-matter sensor over ESP-IDF v4.4's legacy
// driver/i2c.h, a hand-rolled port of the Adafruit_PM25AQI library's I2C path.
// The sensor has no registers: a read is one 32-byte read transaction of the
// Plantower frame (0x42 0x4D, frame length, 13 big-endian words, u16 checksum
// over bytes 0–29), validated the way the library validates it.
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "driver/i2c.h"

// The 15 words after the start bytes, in frame order (PM25_AQI_Data's layout).
typedef struct {
    uint16_t framelen;
    uint16_t pm10_standard, pm25_standard, pm100_standard;
    uint16_t pm10_env, pm25_env, pm100_env;
    uint16_t particles_03um, particles_05um, particles_10um;
    uint16_t particles_25um, particles_50um, particles_100um;
    uint16_t unused;
    uint16_t checksum;
} pmsa003i_data_t;

// The empty write Adafruit_BusIO's begin() sends; false when nothing ACKs at 0x12.
bool pmsa003i_probe(i2c_port_t port);
// One frame; false on a bus error, a bad start byte or a checksum mismatch.
bool pmsa003i_read(i2c_port_t port, pmsa003i_data_t *data);
