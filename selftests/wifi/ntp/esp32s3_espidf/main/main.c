// NTP selftest: join the open AP "Espressif", sync the clock by SNTP from
// ntp.iot.test, then turn the LED on GPIO10 on and print the UTC time; print it
// again 2 s later.
#include <stdio.h>
#include <sys/time.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#define LED_PIN GPIO_NUM_10
#define GOT_IP_BIT BIT0
#define SYNCED_BIT BIT1

static EventGroupHandle_t s_events;

static void on_sta_start(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_wifi_connect();
}

static void on_disconnected(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_wifi_connect();
}

static void on_got_ip(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    xEventGroupSetBits(s_events, GOT_IP_BIT);
}

static void on_time_sync(struct timeval *tv)
{
    xEventGroupSetBits(s_events, SYNCED_BIT);
}

static void join_wifi(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_START, on_sta_start, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, on_disconnected, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_got_ip, NULL));

    wifi_config_t sta = {
        .sta = { .ssid = "Espressif", .threshold.authmode = WIFI_AUTH_OPEN },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta));
    ESP_ERROR_CHECK(esp_wifi_start());
    xEventGroupWaitBits(s_events, GOT_IP_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
}

static void print_time(void)
{
    struct timeval now;
    gettimeofday(&now, NULL);
    struct tm utc;
    gmtime_r(&now.tv_sec, &utc);
    char clock[32];
    strftime(clock, sizeof(clock), "%Y-%m-%d %H:%M:%S", &utc);
    long long epoch_ms = (long long)now.tv_sec * 1000 + now.tv_usec / 1000;
    printf("TIME: %s EPOCH_MS: %lld\n", clock, epoch_ms);
    fflush(stdout);
}

void app_main(void)
{
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    s_events = xEventGroupCreate();
    join_wifi();

    sntp_set_sync_mode(SNTP_SYNC_MODE_IMMED);
    sntp_set_time_sync_notification_cb(on_time_sync);
    esp_sntp_setoperatingmode(ESP_SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "ntp.iot.test");
    esp_sntp_init();

    xEventGroupWaitBits(s_events, SYNCED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    gpio_set_level(LED_PIN, 1);
    print_time();
    vTaskDelay(pdMS_TO_TICKS(2000));
    print_time();
}
