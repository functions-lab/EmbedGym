// GPSPI2 probe firmware (see ../spi_probe.py).
//
// Six spi_master transactions against the worker's BME280 SPI slave on the
// benchmark pins (SCK 38, MISO 40, MOSI 39, CS 41), one line each:
//   GYMSPI <variant> <hex bytes>      the bytes clocked in on MISO
//   GYMSPI <variant> ERR <esp_err>    a driver call failed
//   1  no DMA, full duplex, spi_device_polling_transmit  (chip id)
//   2  no DMA, full duplex, spi_device_transmit          (ISR path)
//   3  no DMA, half duplex, address_bits = 8              (address phase)
//   4  DMA, full duplex, 27-byte calibration burst        (GDMA tx + rx)
//   5  DMA, write pair then read-back                     (MOSI reaches the slave)
//   6  DMA, spics_io_num = -1, CS bit-banged on GPIO41    (software CS)
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "soc/spi_struct.h"
#include "soc/interrupt_core0_reg.h"
#include "xtensa/hal.h"

#define PIN_SCK  GPIO_NUM_38
#define PIN_MISO GPIO_NUM_40
#define PIN_MOSI GPIO_NUM_39
#define PIN_CS   GPIO_NUM_41

#define REG_CHIP_ID  0xD0
#define REG_CALIB    0x88
#define REG_CTRL_HUM 0xF2

static void print_bytes(int variant, const uint8_t *b, size_t n)
{
    printf("GYMSPI %d", variant);
    for (size_t i = 0; i < n; i++) {
        printf(" %02X", b[i]);
    }
    printf("\n");
    fflush(stdout);
}

static void print_err(int variant, esp_err_t err)
{
    printf("GYMSPI %d ERR %s\n", variant, esp_err_to_name(err));
    fflush(stdout);
}

static esp_err_t bus_init(spi_dma_chan_t dma)
{
    spi_bus_config_t bus = {
        .mosi_io_num = PIN_MOSI,
        .miso_io_num = PIN_MISO,
        .sclk_io_num = PIN_SCK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
    };
    return spi_bus_initialize(SPI2_HOST, &bus, dma);
}

static esp_err_t dev_add(spi_device_handle_t *dev, int cs, int address_bits, uint32_t flags)
{
    spi_device_interface_config_t cfg = {
        .clock_speed_hz = 1000000,
        .mode = 0,
        .spics_io_num = cs,
        .queue_size = 4,
        .address_bits = address_bits,
        .flags = flags,
    };
    return spi_bus_add_device(SPI2_HOST, &cfg, dev);
}

/* Full-duplex n-byte exchange; rx may alias tx. */
static esp_err_t xfer(spi_device_handle_t dev, const uint8_t *tx, uint8_t *rx, size_t n, bool polling)
{
    spi_transaction_t t = {
        .length = n * 8,
        .tx_buffer = tx,
        .rx_buffer = rx,
    };
    return polling ? spi_device_polling_transmit(dev, &t) : spi_device_transmit(dev, &t);
}

static void wait_between(void)
{
    vTaskDelay(pdMS_TO_TICKS(20));
}

void app_main(void)
{
    esp_err_t err;
    spi_device_handle_t dev;
    uint8_t rx[4];

    // ── no-DMA bus ──────────────────────────────────────────────────────────
    err = bus_init(SPI_DMA_DISABLED);
    if (err != ESP_OK) {
        print_err(1, err);
        return;
    }

    // 1: polling, full duplex
    err = dev_add(&dev, PIN_CS, 0, 0);
    if (err != ESP_OK) {
        print_err(1, err);
        return;
    }
    const uint8_t id_tx[2] = { REG_CHIP_ID | 0x80, 0x00 };
    err = xfer(dev, id_tx, rx, 2, true);
    if (err != ESP_OK) print_err(1, err); else print_bytes(1, rx, 2);
    wait_between();

    // 2: interrupt-driven, same bytes. Bounded waits so a dead interrupt path
    // prints its state instead of hanging every later variant.
    spi_transaction_t t2 = { .length = 16, .tx_buffer = id_tx, .rx_buffer = rx };
    err = spi_device_queue_trans(dev, &t2, pdMS_TO_TICKS(500));
    if (err == ESP_OK) {
        spi_transaction_t *done = NULL;
        err = spi_device_get_trans_result(dev, &done, pdMS_TO_TICKS(500));
    }
    if (err != ESP_OK) {
        printf("GYMSPI 2 ERR %s src=%d map=%u raw=%08x ena=%08x intset=%08x intenable=%08x\n",
               esp_err_to_name(err), ETS_SPI2_INTR_SOURCE,
               (unsigned) REG_READ(DR_REG_INTERRUPT_CORE0_BASE + 4 * ETS_SPI2_INTR_SOURCE),
               (unsigned) GPSPI2.dma_int_raw.val, (unsigned) GPSPI2.dma_int_ena.val,
               xthal_get_interrupt(), xthal_get_intenable());
        fflush(stdout);
    } else {
        print_bytes(2, rx, 2);
    }
    spi_bus_remove_device(dev);
    wait_between();

    // 3: half duplex, the register byte in the address phase, 1 data byte in
    err = dev_add(&dev, PIN_CS, 8, SPI_DEVICE_HALFDUPLEX);
    if (err != ESP_OK) {
        print_err(3, err);
    } else {
        spi_transaction_t t = {
            .addr = REG_CHIP_ID | 0x80,
            .length = 8,
            .rxlength = 8,
            .rx_buffer = rx,
        };
        err = spi_device_polling_transmit(dev, &t);
        if (err != ESP_OK) print_err(3, err); else print_bytes(3, rx, 1);
        spi_bus_remove_device(dev);
    }
    wait_between();

    // ── DMA bus ─────────────────────────────────────────────────────────────
    err = spi_bus_free(SPI2_HOST);
    if (err != ESP_OK) {
        print_err(4, err);
        return;
    }
    err = bus_init(SPI_DMA_CH_AUTO);
    if (err != ESP_OK) {
        print_err(4, err);
        return;
    }
    err = dev_add(&dev, PIN_CS, 0, 0);
    if (err != ESP_OK) {
        print_err(4, err);
        return;
    }

    // 4: 27-byte burst (register byte + 26 calibration bytes) through GDMA
    uint8_t *dtx = heap_caps_malloc(32, MALLOC_CAP_DMA);
    uint8_t *drx = heap_caps_malloc(32, MALLOC_CAP_DMA);
    memset(dtx, 0, 32);
    dtx[0] = REG_CALIB | 0x80;
    err = xfer(dev, dtx, drx, 27, true);
    if (err != ESP_OK) print_err(4, err); else print_bytes(4, drx, 27);
    wait_between();

    // 5: write pair (control byte has bit 7 clear), then read the register back
    dtx[0] = REG_CTRL_HUM & 0x7F;
    dtx[1] = 0x01;
    err = xfer(dev, dtx, NULL, 2, true);
    if (err != ESP_OK) {
        print_err(5, err);
    } else {
        dtx[0] = REG_CTRL_HUM | 0x80;
        dtx[1] = 0x00;
        err = xfer(dev, dtx, drx, 2, true);
        if (err != ESP_OK) print_err(5, err); else print_bytes(5, drx, 2);
    }
    spi_bus_remove_device(dev);
    wait_between();

    // 6: no hardware CS; the firmware drives GPIO41 itself
    err = dev_add(&dev, -1, 0, 0);
    if (err != ESP_OK) {
        print_err(6, err);
        return;
    }
    gpio_reset_pin(PIN_CS);
    gpio_set_direction(PIN_CS, GPIO_MODE_OUTPUT);
    gpio_set_level(PIN_CS, 1);
    wait_between();
    gpio_set_level(PIN_CS, 0);
    dtx[0] = REG_CHIP_ID | 0x80;
    dtx[1] = 0x00;
    err = xfer(dev, dtx, drx, 2, true);
    gpio_set_level(PIN_CS, 1);
    if (err != ESP_OK) print_err(6, err); else print_bytes(6, drx, 2);
    spi_bus_remove_device(dev);

    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
