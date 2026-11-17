// Checks that `at` really is measured from app start. The other ESP tests
// assert LED state mid-plateau with ~250 ms of margin, so a wrong app-start
// origin (Esp32Driver.appStartNs) shifts every edge together and still passes
// them. This firmware puts sharp edges close to app start instead, where the
// assertion margins are a few ms:
//
//   t=0    app start, LED off
//   t=10   LED on
//   t=20   LED off
//   t=40   LED on
//   t=80   LED off, and stays off
//
// The paired test samples 5 ms either side of each edge. An origin off by
// more than ~5 ms reads the wrong plateau; the documented app-phase jitter is
// <=1 ms, so the margin is loose enough to be stable and tight enough to
// catch a mis-anchored axis that the 250 ms task assertions cannot see.
//
// The delays are measured from a t0 captured at app_main entry rather than
// chained vTaskDelays, so each edge's absolute position does not accumulate
// per-delay rounding.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_timer.h"

#define LED_PIN GPIO_NUM_10

static int64_t t0_us;

static void set_at_ms(int target_ms, int level)
{
    for (;;) {
        int64_t now_ms = (esp_timer_get_time() - t0_us) / 1000;
        if (now_ms >= target_ms) break;
        // Busy-wait on the timer: vTaskDelay rounds to the 10 ms tick, which
        // is the same order as the margins under test here.
    }
    gpio_set_level(LED_PIN, level);
}

void app_main(void)
{
    t0_us = esp_timer_get_time();

    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    set_at_ms(10, 1);
    set_at_ms(20, 0);
    set_at_ms(40, 1);
    set_at_ms(80, 0);

    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
