// L298N PWM selftest (ESP32-S3 variant of code/code.ino). Stages of 600 ms
// from app_main entry; IN1/IN3 HIGH, IN2/IN4 LOW unless noted:
//   0  ENA LOW, ENB HIGH
//   1  ENA LEDC 25 %, ENB LEDC 75 % (1 kHz)
//   2  ENA LEDC 25 % (2 kHz), ENB GPIO HIGH
//   3  ENA LEDC 75 % (2 kHz)
//   4  ENA/ENB GPIO software PWM 30 % / 70 % (2 ms period)
//   5  ENA/ENB HIGH; IN1/IN2 complementary and IN3 software PWM 40 %
//   6  IN1 LOW, IN2 HIGH, ENA HIGH, ENB LOW
#include <stdint.h>
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define IN1 GPIO_NUM_4
#define IN2 GPIO_NUM_5
#define ENA GPIO_NUM_6
#define IN3 GPIO_NUM_7
#define IN4 GPIO_NUM_15
#define ENB GPIO_NUM_16

static int64_t t0_us;

static int64_t micros(void) { return esp_timer_get_time() - t0_us; }

static void output(gpio_num_t pin, int level)
{
    gpio_reset_pin(pin);
    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, level);
}

static void pwm(gpio_num_t pin, ledc_channel_t channel, uint32_t duty)
{
    ledc_channel_config_t config = {
        .gpio_num = pin,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = channel,
        .timer_sel = LEDC_TIMER_0,
        .duty = duty,
        .hpoint = 0,
    };
    ledc_channel_config(&config);
}

static void duty(ledc_channel_t channel, uint32_t value)
{
    ledc_set_duty(LEDC_LOW_SPEED_MODE, channel, value);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, channel);
}

void app_main(void)
{
    t0_us = esp_timer_get_time();
    TickType_t start = xTaskGetTickCount();
    output(IN1, 1);
    output(IN2, 0);
    output(ENA, 0);
    output(IN3, 1);
    output(IN4, 0);
    output(ENB, 1);
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .timer_num = LEDC_TIMER_0,
        .freq_hz = 1000,
        .clk_cfg = LEDC_USE_APB_CLK,
    };
    ledc_timer_config(&timer);

    vTaskDelayUntil(&start, pdMS_TO_TICKS(600));
    pwm(ENA, LEDC_CHANNEL_0, 256);
    pwm(ENB, LEDC_CHANNEL_1, 768);

    vTaskDelayUntil(&start, pdMS_TO_TICKS(600));
    ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 1);
    output(ENB, 1);
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_0, 2000);
    duty(LEDC_CHANNEL_0, 256);

    vTaskDelayUntil(&start, pdMS_TO_TICKS(600));
    duty(LEDC_CHANNEL_0, 768);

    vTaskDelayUntil(&start, pdMS_TO_TICKS(600));
    ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
    output(ENA, 0);
    while (micros() < 3000000) {
        const int64_t phase = micros() % 2000;
        gpio_set_level(ENA, phase < 600);
        gpio_set_level(ENB, phase < 1400);
    }

    gpio_set_level(ENA, 1);
    gpio_set_level(ENB, 1);
    while (micros() < 3600000) {
        const int high = micros() % 2000 < 800;
        gpio_set_level(IN1, high);
        gpio_set_level(IN2, !high);
        gpio_set_level(IN3, high);
    }

    gpio_set_level(IN1, 0);
    gpio_set_level(IN2, 1);
    gpio_set_level(IN3, 1);
    gpio_set_level(ENA, 1);
    gpio_set_level(ENB, 0);
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
