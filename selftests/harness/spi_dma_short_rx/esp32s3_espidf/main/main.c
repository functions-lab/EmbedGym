// A full-duplex GDMA transfer longer than its receive buffer (rxlength <
// length): GDMA fills the receive descriptor and drops the extra byte, and the
// transaction completes. `tail` is the first byte past the descriptor.
#include <stdio.h>
#include <string.h>
#include "driver/spi_master.h"
#include "esp_heap_caps.h"

void app_main(void)
{
    spi_bus_config_t bus = {
        .sclk_io_num = 38,
        .miso_io_num = 40,
        .mosi_io_num = 39,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
    };
    spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO);
    spi_device_interface_config_t dev = {
        .clock_speed_hz = 1000000,
        .mode = 0,
        .spics_io_num = 41,
        .queue_size = 1,
    };
    spi_device_handle_t bme;
    spi_bus_add_device(SPI2_HOST, &dev, &bme);

    uint8_t *tx = heap_caps_calloc(1, 12, MALLOC_CAP_DMA);
    uint8_t *rx = heap_caps_malloc(12, MALLOC_CAP_DMA);
    memset(rx, 0xAA, 12);
    tx[0] = 0xD0;  // read chip id
    spi_transaction_t t = { .length = 9 * 8, .rxlength = 8 * 8, .tx_buffer = tx, .rx_buffer = rx };
    esp_err_t err = spi_device_polling_transmit(bme, &t);
    printf("err %d id %d tail %d\n", err, rx[1], rx[8]);
}
