// Fixture for drift_probe.py: the sampling-grain gold with the yield removed.
//
// This is the sampling-grain ESP firmware
// (selftests/harness/sampling-grain/esp32s3_espidf/main/main.c) minus the
// vTaskDelay(1) in the poll loop. The missing yield is the entire point of the
// fixture, so do NOT "fix" it — a busy-poll of esp_timer_get_time() is the
// worst case for the systimer's ns->tick conversion, reading the counter
// ~139x/ms instead of ~1x/ms.
//
// It exists because that conversion used to drop the sub-tick remainder on
// every read, which made this loop run ~0.43% slow (+43 us per 10 ms period,
// ~13 ms by t=3000) while the yielding gold stayed exact. The fix carries the
// remainder across updates (esp_systimer_update_counter in the QEMU fork), and
// drift_probe.py asserts on this firmware that the 10 ms grid holds.
#include "driver/gpio.h"
#include "esp_timer.h"

#define LED_PIN GPIO_NUM_10

void app_main(void)
{
    int64_t t0_us = esp_timer_get_time();
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    int level = 0;
    for (;;) {
        int64_t ms = (esp_timer_get_time() - t0_us) / 1000;
        int want = (int)((ms / 10) % 2);
        if (want != level) {
            level = want;
            gpio_set_level(LED_PIN, level);
        }
    }
}
