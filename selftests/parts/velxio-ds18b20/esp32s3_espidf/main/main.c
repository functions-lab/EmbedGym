// DS18B20 unit test firmware (ESP32-S3 variant of code/code.ino):
//   ESP-IDF v4.4 has no 1-Wire driver, so the bus is bit-banged. Setup runs
//   the Search ROM discrepancy walk (OneWire::search, as DallasTemperature's
//   begin() does) and prints "Devices: N"; each loop issues Skip ROM +
//   Convert T, polls the busy read slot, then Match ROM + Read Scratchpad
//   (CRC-8 checked) and prints "Temp: %.1f". The harness pokes
//   `set probe.temperature`, so the printed value must follow.
//
// Slot timing is paced on esp_timer_get_time(): esp_rom_delay_us runs 4x slow
// in the grading QEMU (targets.md). The two ways a driver releases the line
// are both exercised, alternating every loop: open-drain writes on a
// GPIO_MODE_INPUT_OUTPUT_OD pin, and switching the direction between
// OUTPUT-LOW and INPUT. Each slot runs with interrupts masked (as OneWire does
// with noInterrupts()): the 1 kHz tick ISR would otherwise stretch a write-1
// LOW past 15 us.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>

#define OW_PIN GPIO_NUM_4

static bool open_drain;
static portMUX_TYPE ow_mux = portMUX_INITIALIZER_UNLOCKED;

static void delay_us(int64_t us)
{
    int64_t t0 = esp_timer_get_time();
    while (esp_timer_get_time() - t0 < us) { }
}

static void bus_mode(bool od)
{
    open_drain = od;
    if (od) {
        gpio_set_level(OW_PIN, 1);
        gpio_set_direction(OW_PIN, GPIO_MODE_INPUT_OUTPUT_OD);
    } else {
        gpio_set_direction(OW_PIN, GPIO_MODE_INPUT);
    }
}

static void bus_low(void)
{
    gpio_set_level(OW_PIN, 0);
    if (!open_drain) gpio_set_direction(OW_PIN, GPIO_MODE_OUTPUT);
}

static void bus_release(void)
{
    if (open_drain) gpio_set_level(OW_PIN, 1);
    else gpio_set_direction(OW_PIN, GPIO_MODE_INPUT);
}

static bool ow_reset(void)
{
    bus_low();
    delay_us(480);
    portENTER_CRITICAL(&ow_mux);
    bus_release();
    delay_us(70);
    bool presence = gpio_get_level(OW_PIN) == 0;
    portEXIT_CRITICAL(&ow_mux);
    delay_us(410);
    return presence;
}

static void ow_write_bit(int bit)
{
    portENTER_CRITICAL(&ow_mux);
    bus_low();
    if (bit) {
        delay_us(6);
        bus_release();
        portEXIT_CRITICAL(&ow_mux);
        delay_us(64);
    } else {
        delay_us(60);
        bus_release();
        portEXIT_CRITICAL(&ow_mux);
        delay_us(10);
    }
}

static int ow_read_bit(void)
{
    portENTER_CRITICAL(&ow_mux);
    bus_low();
    delay_us(3);
    bus_release();
    delay_us(10);
    int bit = gpio_get_level(OW_PIN);
    portEXIT_CRITICAL(&ow_mux);
    delay_us(53);
    return bit;
}

static void ow_write(uint8_t v)
{
    for (int i = 0; i < 8; i++) ow_write_bit((v >> i) & 1);
}

static uint8_t ow_read(void)
{
    uint8_t v = 0;
    for (int i = 0; i < 8; i++) if (ow_read_bit()) v |= 1 << i;
    return v;
}

static uint8_t crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0;
    for (int i = 0; i < len; i++) {
        uint8_t b = data[i];
        for (int j = 0; j < 8; j++) {
            uint8_t mix = (crc ^ b) & 1;
            crc >>= 1;
            if (mix) crc ^= 0x8c;
            b >>= 1;
        }
    }
    return crc;
}

// OneWire::search, one pass: fills rom, returns false when the walk fails or
// no more devices remain.
static int last_discrepancy;
static bool last_device;

static bool ow_search(uint8_t rom[8])
{
    if (last_device) return false;
    if (!ow_reset()) return false;
    ow_write(0xf0);
    int id_bit_number = 1, last_zero = 0, rom_byte = 0;
    uint8_t rom_mask = 1;
    while (rom_byte < 8) {
        int id_bit = ow_read_bit();
        int cmp_id_bit = ow_read_bit();
        if (id_bit == 1 && cmp_id_bit == 1) return false;
        int direction;
        if (id_bit != cmp_id_bit) {
            direction = id_bit;
        } else {
            if (id_bit_number < last_discrepancy) direction = (rom[rom_byte] & rom_mask) ? 1 : 0;
            else direction = id_bit_number == last_discrepancy;
            if (direction == 0) last_zero = id_bit_number;
        }
        if (direction) rom[rom_byte] |= rom_mask;
        else rom[rom_byte] &= ~rom_mask;
        ow_write_bit(direction);
        id_bit_number++;
        rom_mask <<= 1;
        if (rom_mask == 0) {
            rom_byte++;
            rom_mask = 1;
        }
    }
    last_discrepancy = last_zero;
    if (last_discrepancy == 0) last_device = true;
    return rom[0] != 0 && crc8(rom, 7) == rom[7];
}

// DallasTemperature::getTempCByIndex: -127 when the read fails.
static float read_temperature(const uint8_t rom[8])
{
    if (!ow_reset()) return -127;
    ow_write(0xcc);
    ow_write(0x44);
    int polls = 0;
    while (ow_read_bit() == 0) {
        if (++polls > 20000) return -127; // ~1.5 s, past the 750 ms 12-bit conversion
    }
    if (!ow_reset()) return -127;
    ow_write(0x55);
    for (int i = 0; i < 8; i++) ow_write(rom[i]);
    ow_write(0xbe);
    uint8_t sp[9];
    for (int i = 0; i < 9; i++) sp[i] = ow_read();
    if (crc8(sp, 8) != sp[8]) return -127;
    int16_t raw = (int16_t)((sp[1] << 8) | sp[0]);
    return raw / 16.0f;
}

void app_main(void)
{
    gpio_reset_pin(OW_PIN);
    bus_mode(true);

    uint8_t rom[8] = {0};
    int devices = 0;
    uint8_t found[8];
    while (ow_search(found)) {
        devices++;
        for (int i = 0; i < 8; i++) rom[i] = found[i];
    }
    printf("Devices: %d\n", devices);
    fflush(stdout);

    for (int n = 0;; n++) {
        bus_mode((n & 1) == 0);
        printf("Temp: %.1f\n", read_temperature(rom));
        fflush(stdout);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
