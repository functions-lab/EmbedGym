// ROM-delay probe firmware (see ../rom_delay_probe.py).
//
// esp_rom_delay_us() busy-waits on CCOUNT, which ticks at the core clock.
// ESP-IDF switches the S3 to 160 MHz at boot through SYSTEM_CPU_PER_CONF /
// SYSTEM_SYSCLK_CONF; the QEMU S3 used to drop those writes and leave the
// core at its 40 MHz reset rate, so every ROM delay lasted 4x its requested
// time while esp_timer_get_time() (systimer, fixed 16 MHz) stayed exact.
// Bit-banged protocols (DHT11, 1-Wire) read their timings through this path.
#include <stdio.h>
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define REQUESTED_US 1000

void app_main(void)
{
    for (;;) {
        int64_t t0 = esp_timer_get_time();
        esp_rom_delay_us(REQUESTED_US);
        int64_t t1 = esp_timer_get_time();
        printf("GYMDELAY %lld\n", (long long)(t1 - t0));
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
