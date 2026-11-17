// WiFi join selftest: connect to the open AP "Espressif" (no password). The
// LED on GPIO10 stays off until DHCP assigns an address, then turns on and the
// address and the AP's RSSI are printed once.
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#define LED_PIN GPIO_NUM_10
#define GOT_IP_BIT BIT0

static EventGroupHandle_t s_events;
static esp_ip4_addr_t s_ip;

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
    s_ip = ((ip_event_got_ip_t *)data)->ip_info.ip;
    xEventGroupSetBits(s_events, GOT_IP_BIT);
}

void app_main(void)
{
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    s_events = xEventGroupCreate();
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
    gpio_set_level(LED_PIN, 1);

    wifi_ap_record_t ap;
    ESP_ERROR_CHECK(esp_wifi_sta_get_ap_info(&ap));
    printf("IP: " IPSTR " RSSI: %d\n", IP2STR(&s_ip), ap.rssi);
    fflush(stdout);
}
