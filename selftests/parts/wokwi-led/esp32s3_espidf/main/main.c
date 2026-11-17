// LED unit test firmware (ESP32-S3 variant of code/code.ino):
//   Digital phase: blink GPIO10; `value` tracks the pin through the resistor.
//   PWM phase: LEDC half duty -> `brightness` reports the duty; full duty ->
//   brightness must read 1; duty 0 -> off.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/ledc.h"

#define LED_PIN GPIO_NUM_10

static void ledc_duty_pct(uint32_t pct)
{
    /* An 8-bit duty runs 0..256: 255 is 255/256 of the period, 256 holds the pin high */
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, (256 * pct) / 100);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

void app_main(void)
{
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);

    gpio_set_level(LED_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(1000));
    gpio_set_level(LED_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(1000));
    gpio_set_level(LED_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(1000));
    gpio_set_level(LED_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(1000));

    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_8_BIT,
        .timer_num = LEDC_TIMER_0,
        .freq_hz = 5000,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer);
    ledc_channel_config_t channel = {
        .gpio_num = LED_PIN,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_0,
        .duty = 128,
        .hpoint = 0,
    };
    ledc_channel_config(&channel);
    vTaskDelay(pdMS_TO_TICKS(1000));

    ledc_duty_pct(100);
    vTaskDelay(pdMS_TO_TICKS(1000));

    ledc_duty_pct(0);
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
