// ESP port of the sampling-grain probe (see the AVR variant's code.ino).
// The pin level is a pure function of simulated time, toggling every 10 ms;
// the shared test samples mid-plateau on alternating plateaus, so a driver
// that lands checks on frame boundaries instead of parking at each `at`
// collapses neighbours onto one timestamp and reads the wrong plateau.
//
// The grid is anchored at a t0 captured as the first statement of app_main —
// the ESP spelling of the AVR sketch's millis(), which is 0 at the harness's
// t=0. That t0 read lands ~0.46 ms after the harness zero (measured by
// selftests/probes/esp32s3_espidf/anchor_probe.py; IDF entry cost no sketch can
// remove, deterministic under icount), so every edge sits 0.46 ms late and
// the mid-plateau samples at 1005/1015/… keep a 4.5 ms margin. This doubles
// as the guard that the t0-capture style stays aligned: a regression of half
// a plateau (5 ms) inverts all ten checks.
//
// The poll loop yields (vTaskDelay(1); the backend tick is 1 ms, so the edge
// lands within ~1 ms of the crossing). A busy-poll of esp_timer used to drift
// ~0.43% slow against the virtual clock under this QEMU model, which inverted
// the later checks; that is fixed in the fork's systimer and guarded by
// selftests/probes/esp32s3_espidf/drift_probe.py.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_timer.h"

#define LED_PIN GPIO_NUM_10

void app_main(void)
{
    int64_t t0_us = esp_timer_get_time();
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    // Tracks the pin so the loop writes only on a change; seeded to match the
    // level set above.
    int level = 0;
    for (;;) {
        int64_t ms = (esp_timer_get_time() - t0_us) / 1000;
        int want = (int)((ms / 10) % 2);
        if (want != level) {
            level = want;
            gpio_set_level(LED_PIN, level);
        }
        vTaskDelay(1);
    }
}
