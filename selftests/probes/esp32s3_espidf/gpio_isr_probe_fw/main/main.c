// GPIO-interrupt probe firmware (see ../gpio_isr_probe.py).
//
// One any-edge ISR per pin, on GPIO4 (bank 0, read back through PCPU_INT) and
// GPIO40 (bank 1, PCPU_INT1). Each handler queues its own pin number with the
// level it read, so a hit filed under the wrong status bit reaches the wrong
// handler and shows up as a wrong count. The task prints one line per event:
//   GYMISR <gpio> <count> <level>
#include <stdio.h>
#include "driver/gpio.h"
#include "esp_attr.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#define PIN_LOW_BANK  GPIO_NUM_4
#define PIN_HIGH_BANK GPIO_NUM_40

typedef struct {
    int gpio;
    int level;
} edge_t;

static QueueHandle_t edges;

static void IRAM_ATTR on_edge(void *arg)
{
    gpio_num_t pin = (gpio_num_t)(intptr_t)arg;
    edge_t e = { .gpio = pin, .level = gpio_get_level(pin) };
    xQueueSendFromISR(edges, &e, NULL);
}

static void watch(gpio_num_t pin)
{
    gpio_reset_pin(pin);
    gpio_set_direction(pin, GPIO_MODE_INPUT);
    gpio_set_pull_mode(pin, GPIO_FLOATING);
    gpio_set_intr_type(pin, GPIO_INTR_ANYEDGE);
    gpio_isr_handler_add(pin, on_edge, (void *)(intptr_t)pin);
}

void app_main(void)
{
    edges = xQueueCreate(16, sizeof(edge_t));
    gpio_install_isr_service(0);
    watch(PIN_LOW_BANK);
    watch(PIN_HIGH_BANK);

    int count[GPIO_NUM_MAX] = {0};
    for (;;) {
        edge_t e;
        if (xQueueReceive(edges, &e, portMAX_DELAY)) {
            count[e.gpio]++;
            printf("GYMISR %d %d %d\n", e.gpio, count[e.gpio], e.level);
            fflush(stdout);
        }
    }
}
