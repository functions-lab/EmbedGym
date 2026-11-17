// KY-038 unit test firmware (ESP32-S3 variant of code/code.ino):
//   Polls D0 every 1 ms and timestamps its raw transitions. Once D0 has held
//   for SETTLE_MS it reports the settled change: how many transitions led to
//   it and, for a rise, when the later ones came (ms after the first). A0's
//   loud/quiet state is reported as it changes.
//
// A0 carries soundLevel/1023 * 3.3 V; the 12-bit raw value is shifted to the
// AVR sketch's 10-bit scale so the serial output matches.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/adc.h"
#include "esp_timer.h"
#include <stdio.h>

#define D0_PIN GPIO_NUM_14
#define A0_CHANNEL ADC1_CHANNEL_3   // GPIO4
#define SETTLE_MS 50
#define MAX_EDGES 4

void app_main(void)
{
    gpio_reset_pin(D0_PIN);
    gpio_set_direction(D0_PIN, GPIO_MODE_INPUT);
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(A0_CHANNEL, ADC_ATTEN_DB_11);

    int stable = gpio_get_level(D0_PIN);
    int last = stable;
    int edges = 0;
    int64_t edge_ms[MAX_EDGES];
    int64_t last_edge_ms = 0;
    int loud = 0;

    for (;;) {
        int64_t now = esp_timer_get_time() / 1000;
        int d0 = gpio_get_level(D0_PIN);
        if (d0 != last) {
            last = d0;
            if (edges < MAX_EDGES) edge_ms[edges] = now;
            edges++;
            last_edge_ms = now;
        }
        if (edges > 0 && now - last_edge_ms >= SETTLE_MS) {
            if (d0 == stable) {
                printf("Glitch edges: %d\n", edges);
            } else if (d0) {
                printf("Sound edges: %d\nSound chatter:", edges);
                for (int i = 1; i < edges && i < MAX_EDGES; i++) {
                    printf(" %d", (int)(edge_ms[i] - edge_ms[0]));
                }
                printf("\n");
            } else {
                printf("Quiet edges: %d\n", edges);
            }
            fflush(stdout);
            stable = d0;
            edges = 0;
        }

        int now_loud = (adc1_get_raw(A0_CHANNEL) >> 2) > 700;
        if (now_loud != loud) {
            loud = now_loud;
            printf(loud ? "LOUD\n" : "QUIET\n");
            fflush(stdout);
        }

        vTaskDelay(pdMS_TO_TICKS(1));
    }
}
