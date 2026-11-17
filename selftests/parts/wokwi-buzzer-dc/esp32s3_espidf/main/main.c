// Buzzer DC-hold semantics (ESP32-S3 variant of code/code.ino): a passive
// buzzer under a held level is one click, not a tone — hasSignal must read
// false while GPIO10 sits at either level.
//   t = 0     pin HIGH and held
//   t = 3000  pin LOW
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

#define BUZZER_PIN GPIO_NUM_10

void app_main(void)
{
    gpio_reset_pin(BUZZER_PIN);
    gpio_set_direction(BUZZER_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(BUZZER_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(3000));
    gpio_set_level(BUZZER_PIN, 0);
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
