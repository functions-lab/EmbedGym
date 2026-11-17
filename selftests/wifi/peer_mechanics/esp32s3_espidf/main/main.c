// Peer mechanics selftest: join the open AP "Espressif", connect to the MQTT
// broker mqtt.iot.test:1883 as iot/iotpass, publish a counter (0, 1, 2, …) on
// gym/mech/count every second, and drive the LED on GPIO10 from ON/OFF on
// gym/mech/cmd.
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "mqtt_client.h"
#include "nvs_flash.h"

#define LED_PIN GPIO_NUM_10
#define GOT_IP_BIT BIT0
#define MQTT_UP_BIT BIT1
#define COUNT_TOPIC "gym/mech/count"
#define CMD_TOPIC "gym/mech/cmd"

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

static void on_command(const char *payload, int len)
{
    if (len == 2 && memcmp(payload, "ON", 2) == 0) {
        gpio_set_level(LED_PIN, 1);
        printf("LED ON\n");
    } else if (len == 3 && memcmp(payload, "OFF", 3) == 0) {
        gpio_set_level(LED_PIN, 0);
        printf("LED OFF\n");
    } else {
        printf("BAD COMMAND %.*s\n", len, payload);
    }
    fflush(stdout);
}

static void on_mqtt(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t event = data;
    switch ((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED:
        esp_mqtt_client_subscribe(event->client, CMD_TOPIC, 0);
        printf("MQTT connected\n");
        fflush(stdout);
        xEventGroupSetBits(s_events, MQTT_UP_BIT);
        break;
    case MQTT_EVENT_DISCONNECTED:
        printf("MQTT disconnected\n");
        fflush(stdout);
        xEventGroupClearBits(s_events, MQTT_UP_BIT);
        break;
    case MQTT_EVENT_DATA:
        if (event->topic_len == strlen(CMD_TOPIC) && memcmp(event->topic, CMD_TOPIC, event->topic_len) == 0) {
            on_command(event->data, event->data_len);
        }
        break;
    default:
        break;
    }
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

void app_main(void)
{
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    s_events = xEventGroupCreate();
    join_wifi();

    esp_mqtt_client_config_t config = {
        .uri = "mqtt://mqtt.iot.test:1883",
        .client_id = "gym-peer-mechanics",
        .username = "iot",
        .password = "iotpass",
        .keepalive = 120,
    };
    esp_mqtt_client_handle_t client = esp_mqtt_client_init(&config);
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(client, ESP_EVENT_ANY_ID, on_mqtt, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_start(client));

    for (int count = 0;; count++) {
        xEventGroupWaitBits(s_events, MQTT_UP_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
        char payload[12];
        snprintf(payload, sizeof(payload), "%d", count);
        esp_mqtt_client_publish(client, COUNT_TOPIC, payload, 0, 0, 0);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
