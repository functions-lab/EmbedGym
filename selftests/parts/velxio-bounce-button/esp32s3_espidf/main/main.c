// Bounce button unit test firmware (ESP32-S3 variant of code/code.ino).
//
// Pull-down button: GPIO12 idles LOW through R_PD and reads HIGH while the
// switch is closed. The loop samples the pin without yielding and timestamps
// every raw transition. Once the level has held for SETTLE_US it reports the
// debounced event: how many transitions the contacts made, and when each one
// after the first came, in µs after the first.
#include "driver/gpio.h"
#include "esp_timer.h"
#include <stdio.h>

#define BUTTON_PIN GPIO_NUM_12
#define SETTLE_US 20000
#define MAX_EDGES 8

void app_main(void)
{
    gpio_reset_pin(BUTTON_PIN);
    gpio_set_direction(BUTTON_PIN, GPIO_MODE_INPUT);

    int stable = gpio_get_level(BUTTON_PIN);
    int last = stable;
    int edges = 0;
    int64_t edge_us[MAX_EDGES];
    int64_t last_edge_us = 0;
    for (;;) {
        int64_t now = esp_timer_get_time();
        int level = gpio_get_level(BUTTON_PIN);
        if (level != last) {
            last = level;
            if (edges < MAX_EDGES) edge_us[edges] = now;
            edges++;
            last_edge_us = now;
        }
        if (edges > 0 && now - last_edge_us >= SETTLE_US) {
            if (level == stable) {
                printf("Glitch edges: %d\n", edges);
            } else {
                stable = level;
                const char *name = level ? "Press" : "Release";
                printf("%s edges: %d\n%s bounce:", name, edges, name);
                for (int i = 1; i < edges && i < MAX_EDGES; i++) {
                    printf(" %d", (int)(edge_us[i] - edge_us[0]));
                }
                printf("\n");
            }
            fflush(stdout);
            edges = 0;
        }
    }
}
