// Serial timestamps must use app start as their zero point, the same origin
// `at` values use. Two harness properties are under test, neither of which the
// AVR path can exercise (it has no boot phase to speak of):
//
//   1. Serial timestamps count from app start. The first line prints
//      300 ms after app_main begins, so on the app-relative axis @n.t[0] must
//      land near 300 — not near 800, which is where it sits on the power-on
//      axis after ~500 ms of ROM/bootloader.
//   2. The IDF boot log does not leak into `parse`. Everything the ROM and
//      bootloader print leaves UART0 *before* app start, so it is replayed at
//      negative times. A `parse` window of `t <= at` alone admits every one of
//      those lines, since negative timestamps satisfy it; the window must be
//      bounded below at t=0 as well. The paired test parses `entry {addr:s}`,
//      which matches the real bootloader line `entry 0x403c98b8` printed at
//      about -447 ms, so the slot binds a value if that bound is missing.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_log.h"
#include <stdio.h>

#define FIRST_PRINT_MS 300
#define PERIOD_MS 200

__attribute__((constructor)) static void startup_log(void)
{
    ESP_LOGI("serial-probe", "BOOT_INFO_MUST_STAY_QUIET");
}

void app_main(void)
{
    // Anchor at app start: esp_timer counts from power-on, but the harness
    // axis begins here, so the phase has to be measured from this instant.
    int64_t t0_us = esp_timer_get_time();

    vTaskDelay(pdMS_TO_TICKS(FIRST_PRINT_MS));

    for (int n = 0; ; n++) {
        int elapsed_ms = (int)((esp_timer_get_time() - t0_us) / 1000);
        printf("N: %d T: %d\n", n, elapsed_ms);
        printf("TICK\n");
        ESP_LOGI("serial-probe", "APP_INFO %d", n);
        if (n == 50) ESP_LOGI("serial-probe", "LATE_INFO");
        fflush(stdout);
        vTaskDelay(pdMS_TO_TICKS(PERIOD_MS));
    }
}
