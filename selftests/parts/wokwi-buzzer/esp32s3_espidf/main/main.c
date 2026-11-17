// Buzzer unit test firmware (ESP32-S3 variant of code/code.ino). There is no
// tone(): the tone is LEDC PWM at 50 % duty on the tone frequency, silence is
// duty 0 on the same channel.
//   t = 0      1 kHz on GPIO10
//   t = 1000   off
//   t = 2000   2 kHz
//   t = 3000   off
//   then 4 slow beeps (100 ms on / 400 ms off) and 16 fast ones (50 / 75) at
//   1.5 kHz — `pulseRate` counts tone starts in the trailing second.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"

#define BUZZER_PIN GPIO_NUM_10

static void tone_on(uint32_t freq_hz)
{
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_0, freq_hz);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 1 << 12); // 50 % of 13 bits
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

static void tone_off(void)
{
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

void app_main(void)
{
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_13_BIT,
        .timer_num = LEDC_TIMER_0,
        .freq_hz = 1000,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer);
    ledc_channel_config_t channel = {
        .gpio_num = BUZZER_PIN,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0,
        .hpoint = 0,
    };
    ledc_channel_config(&channel);

    tone_on(1000);
    vTaskDelay(pdMS_TO_TICKS(1000));
    tone_off();
    vTaskDelay(pdMS_TO_TICKS(1000));
    tone_on(2000);
    vTaskDelay(pdMS_TO_TICKS(1000));
    tone_off();
    vTaskDelay(pdMS_TO_TICKS(1000));

    for (int i = 0; i < 4; i++) {
        tone_on(1500);
        vTaskDelay(pdMS_TO_TICKS(100));
        tone_off();
        vTaskDelay(pdMS_TO_TICKS(400));
    }
    for (int i = 0; i < 16; i++) {
        tone_on(1500);
        vTaskDelay(pdMS_TO_TICKS(50));
        tone_off();
        vTaskDelay(pdMS_TO_TICKS(75));
    }
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
